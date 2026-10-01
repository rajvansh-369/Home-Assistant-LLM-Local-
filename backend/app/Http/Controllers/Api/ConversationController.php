<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SinceRequest;
use App\Http\Requests\StoreConversationRequest;
use App\Http\Resources\ConversationResource;
use App\Models\Conversation;
use App\Models\Profile;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;

/**
 * The unlocked profile's conversations (§5). Deleting keeps a tombstone so
 * other phones learn about it through `deleted`.
 */
class ConversationController extends Controller
{
    public const PAGE_SIZE = 50;

    public function index(SinceRequest $request): JsonResponse
    {
        $profile = $this->profile($request);
        $since = $request->since();

        $page = $profile->conversations()
            ->withCount('messages')
            ->when($since, fn ($query) => $query->where('updated_at', '>=', $since))
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->cursorPaginate(self::PAGE_SIZE);

        $body = ['data' => ConversationResource::collection($page->items())];

        if ($since !== null) {
            $body['deleted'] = $profile->conversations()
                ->onlyTrashed()
                ->where('deleted_at', '>=', $since)
                ->orderBy('id')
                ->pluck('id');
        }

        $body['meta'] = ['next_cursor' => $page->nextCursor()?->encode()];

        return response()->json($body);
    }

    /**
     * Idempotent by client_uuid: 201 when new, 200 when the phone retries.
     */
    public function store(StoreConversationRequest $request): JsonResponse
    {
        $profile = $this->profile($request);
        self::ensureHistory($profile);

        $conversation = $this->existing($profile, $request->validated('client_uuid'));
        if ($conversation !== null) {
            return (new ConversationResource($conversation->loadCount('messages')))->response();
        }

        try {
            $conversation = $profile->conversations()->create($request->validated());
        } catch (UniqueConstraintViolationException) {
            // A retry raced the first upload; answer as a retry.
            $conversation = $this->existing($profile, $request->validated('client_uuid'));

            return (new ConversationResource($conversation->loadCount('messages')))->response();
        }

        return (new ConversationResource($conversation->loadCount('messages')))->response()->setStatusCode(201);
    }

    public function destroy(Conversation $conversation): Response
    {
        $conversation->delete(); // removes the messages now, keeps the tombstone

        return response()->noContent();
    }

    /** Every conversation of the profile, each kept as a tombstone for sync. */
    public function clear(Request $request): Response
    {
        $this->profile($request)->conversations()->each(fn (Conversation $conversation) => $conversation->delete());

        return response()->noContent();
    }

    /** "Keep chat history" off: nothing new is stored for the profile. */
    public static function ensureHistory(Profile $profile): void
    {
        abort_unless($profile->history_enabled, 403, 'Chat history is turned off for this profile.');
    }

    private function existing(Profile $profile, string $clientUuid): ?Conversation
    {
        $conversation = Conversation::withTrashed()->where('client_uuid', $clientUuid)->first();

        if ($conversation !== null && ($conversation->profile_id !== $profile->id || $conversation->trashed())) {
            throw ValidationException::withMessages([
                'client_uuid' => $conversation->trashed() && $conversation->profile_id === $profile->id
                    ? 'This conversation was deleted.'
                    : 'This client_uuid is already in use.',
            ]);
        }

        return $conversation;
    }
}
