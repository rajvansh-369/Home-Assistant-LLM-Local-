<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ActivityBatchRequest;
use App\Http\Resources\ActivityResource;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * The activity log: uploaded by the phone, read by each profile (§5).
 */
class ActivityController extends Controller
{
    public const PAGE_SIZE = 50;

    /**
     * Stores new events and skips ones already stored. The household comes
     * from the device token, never from the request.
     */
    public function batch(ActivityBatchRequest $request): JsonResponse
    {
        $household = $this->household($request);
        $device = $this->device($request);
        /** @var list<array<string, mixed>> $events */
        $events = $request->validated('events');

        $known = ActivityLog::query()->whereIn('client_uuid', array_column($events, 'client_uuid'))->pluck('client_uuid')->flip();
        $now = now()->format('Y-m-d H:i:s');

        $rows = array_map(fn (array $event) => [
            'user_id' => $household->id,
            'profile_id' => $event['profile_id'] ?? null,
            'device_id' => $device->id,
            'client_uuid' => $event['client_uuid'],
            'type' => $event['type'],
            'summary' => $event['summary'],
            'meta' => isset($event['meta']) ? json_encode($event['meta']) : null,
            'occurred_at' => Carbon::parse($event['occurred_at'])->utc()->format('Y-m-d H:i:s'),
            'created_at' => $now,
        ], array_values(array_filter($events, fn (array $event) => ! $known->has($event['client_uuid']))));

        $accepted = 0;
        foreach (array_chunk($rows, 250) as $chunk) {
            $accepted += ActivityLog::query()->insertOrIgnore($chunk);
        }

        return response()->json([
            'accepted' => $accepted,
            'duplicates' => count($events) - $accepted,
        ]);
    }

    /**
     * The profile's own events, newest first. The Owner also sees device
     * events, which belong to no profile.
     */
    public function index(Request $request): JsonResponse
    {
        $profile = $this->profile($request);

        $page = ActivityLog::query()
            ->where('user_id', $profile->user_id)
            ->where(fn ($query) => $query
                ->where('profile_id', $profile->id)
                ->when($profile->isOwner(), fn ($q) => $q->orWhereNull('profile_id')))
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->cursorPaginate(self::PAGE_SIZE);

        return response()->json([
            'data' => ActivityResource::collection($page->items()),
            'meta' => ['next_cursor' => $page->nextCursor()?->encode()],
        ]);
    }
}
