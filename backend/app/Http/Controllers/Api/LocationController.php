<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LocationBatchRequest;
use App\Http\Requests\LocationDayRequest;
use App\Http\Resources\PointResource;
use App\Models\Location;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

/**
 * Location points from the phone, and one day's trail for the Owner (§5).
 * Never log coordinates.
 */
class LocationController extends Controller
{
    /**
     * Stores new points, skips ones already stored, and discards everything
     * while tracking is off or paused.
     */
    public function batch(LocationBatchRequest $request): JsonResponse
    {
        $household = $this->household($request);
        $device = $this->device($request);
        /** @var list<array<string, mixed>> $points */
        $points = $request->validated('points');

        $known = Location::query()->whereIn('client_uuid', array_column($points, 'client_uuid'))->pluck('client_uuid')->flip();
        $new = array_values(array_filter($points, fn (array $point) => ! $known->has($point['client_uuid'])));

        $settings = $household->locationSettings;
        $tracking = $settings === null
            || ($settings->enabled && ($settings->paused_until === null || $settings->paused_until->isPast()));

        if (! $tracking) {
            return response()->json(['accepted' => 0, 'duplicates' => $known->count(), 'discarded' => count($new)]);
        }

        $now = now()->format('Y-m-d H:i:s');
        $rows = array_map(fn (array $point) => [
            'user_id' => $household->id,
            'device_id' => $device->id,
            'client_uuid' => $point['client_uuid'],
            'lat' => $point['lat'],
            'lng' => $point['lng'],
            'accuracy_m' => $point['accuracy_m'] ?? null,
            'event' => $point['event'],
            'place_id' => $point['place_id'] ?? null,
            'recorded_at' => Carbon::parse($point['recorded_at'])->utc()->format('Y-m-d H:i:s'),
            'created_at' => $now,
        ], $new);

        $accepted = 0;
        foreach (array_chunk($rows, 250) as $chunk) {
            // A parallel retry may have stored some of these meanwhile; the unique key skips them.
            $accepted += Location::query()->insertOrIgnore($chunk);
        }

        return response()->json([
            'accepted' => $accepted,
            'duplicates' => $known->count() + count($rows) - $accepted,
            'discarded' => 0,
        ]);
    }

    /**
     * One local day, in the requested IANA timezone, oldest point first.
     */
    public function index(LocationDayRequest $request): JsonResponse
    {
        $tz = $request->validated('tz') ?? 'UTC';
        $start = CarbonImmutable::createFromFormat('Y-m-d', $request->validated('date'), $tz)->startOfDay();

        $points = $this->household($request)->locations()
            ->where('recorded_at', '>=', $start->utc())
            ->where('recorded_at', '<', $start->addDay()->utc())
            ->orderBy('recorded_at')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => PointResource::collection($points),
            'meta' => ['date' => $request->validated('date'), 'tz' => $tz, 'count' => $points->count()],
        ]);
    }
}
