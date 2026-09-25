<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ListMessagesRequest;
use App\Http\Requests\StoreMessagesRequest;
use App\Http\Requests\UpdateMessageRequest;
use App\Http\Resources\MessageResource;
use App\Models\ChatMessage;
use App\Models\Conversation;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Finished exchanges uploaded by the phone (§5). content is encrypted at
 * rest by the model cast; never log it.
 */
class ChatMessageController extends Controller
{
    /** Fields copied from an uploaded message as they are. */
    private const FIELDS = ['role', 'finish_reason', 'memory_id', 'live', 'cited', 'sources', 'recalled', 'sampling', 'usage', 'seconds', 'rating', 'context'];

    public function index(ListMessagesRequest $request, Conversation $conversation): JsonResponse
    {
        $limit = (int) ($request->validated('limit') ?? ListMessagesRequest::DEFAULT_LIMIT);

        $messages = $conversation->messages()
            ->where('id', '>', (int) ($request->validated('after') ?? 0))
            ->orderBy('id')
            ->limit($limit + 1)
            ->get();

        return response()->json([
            'data' => MessageResource::collection($messages->take($limit)),
            'meta' => ['has_more' => $messages->count() > $limit],
        ]);
    }

    /**
     * Upserts 1–50 messages by client_uuid in one transaction, so a retried
     * upload stores nothing twice and returns the same ids.
     */
    public function store(StoreMessagesRequest $request, Conversation $conversation): JsonResponse
    {
        /** @var list<array<string, mixed>> $items */
        $items = $request->validated('messages');

        $stored = DB::transaction(function () use ($items, $conversation) {
            $existing = ChatMessage::query()
                ->whereIn('client_uuid', array_column($items, 'client_uuid'))
                ->lockForUpdate()
                ->get()
                ->keyBy('client_uuid');

            $newest = $conversation->last_message_at;
            $stored = [];

            foreach ($items as $i => $item) {
                $message = $existing->get($item['client_uuid']) ?? new ChatMessage(['client_uuid' => $item['client_uuid']]);

                if ($message->exists && $message->conversation_id !== $conversation->id) {
                    throw ValidationException::withMessages([
                        "messages.{$i}.client_uuid" => 'This client_uuid belongs to another conversation.',
                    ]);
                }

                $sentAt = Carbon::parse($item['sent_at'])->utc();
                $message->fill([
                    ...Arr::only($item, self::FIELDS),
                    'content' => $item['content'] ?? '',
                    'sent_at' => $sentAt,
                    'live' => $item['live'] ?? false,
                    'cited' => $item['cited'] ?? false,
                    'sources' => $item['sources'] ?? [],
                    'context' => $item['context'] ?? [],
                ]);
                $message->conversation()->associate($conversation);
                $message->save();

                $stored[] = ['id' => $message->id, 'client_uuid' => $message->client_uuid];
                $newest = $newest === null || $sentAt->greaterThan($newest) ? $sentAt : $newest;
            }

            $conversation->last_message_at = $newest;
            $conversation->touch();

            return $stored;
        });

        return response()->json(['data' => $stored]);
    }

    public function update(UpdateMessageRequest $request, ChatMessage $message): MessageResource
    {
        $changes = Arr::only($request->validated(), ['rating', 'finish_reason']);

        if ($request->has('content')) {
            $changes['content'] = $request->validated('content') ?? '';
        }

        $message->update($changes);

        return new MessageResource($message);
    }
}
