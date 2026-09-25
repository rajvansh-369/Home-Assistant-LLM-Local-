<?php

namespace App\Services;

use App\Models\Device;
use App\Models\DeviceActivityDay;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Keeps devices.last_seen_at, app_version and device_activity_days current
 * without writing on every request.
 */
class DeviceTracker
{
    /** last_seen_at is written at most this often. */
    private const SEEN_EVERY_SECONDS = 60;

    /**
     * The device a token was issued to. Both token types are named "device:{id}".
     */
    public function deviceFor(PersonalAccessToken $token, User $household): ?Device
    {
        $id = self::deviceIdFromName($token->name);

        return $id === null ? null : $household->devices()->find($id);
    }

    public static function deviceIdFromName(?string $name): ?int
    {
        return $name !== null && preg_match('/^device:(\d+)$/', $name, $match) ? (int) $match[1] : null;
    }

    public function track(Request $request, Device $device): void
    {
        $now = now();
        $changes = [];

        if (Cache::add("aster:device-seen:{$device->id}", true, self::SEEN_EVERY_SECONDS)) {
            $changes['last_seen_at'] = $now;
        }

        $version = $request->header('X-App-Version');
        if (is_string($version) && preg_match('/^[\w.+\- ]{1,40}$/', $version) && $version !== $device->app_version) {
            $changes['app_version'] = $version;
        }

        if ($changes !== []) {
            $device->forceFill($changes)->save();
        }

        $day = $now->copy()->setTimezone(config('aster.admin.timezone'))->toDateString();
        if (Cache::add("aster:device-day:{$device->id}:{$day}", true, now()->addDay())) {
            DeviceActivityDay::insertOrIgnore([
                'user_id' => $device->user_id,
                'device_id' => $device->id,
                'day' => $day,
            ]);
        }
    }
}
