<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Models\AuthEvent;
use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Writes sign-in, unlock and lockout events to auth_events for the admin
 * panel's Security views.
 */
class AuthEvents
{
    public function record(
        AuthEventType $type,
        Request $request,
        ?User $household = null,
        ?Profile $profile = null,
        ?Device $device = null,
    ): AuthEvent {
        return AuthEvent::create([
            'user_id' => $household->id ?? $profile?->user_id,
            'profile_id' => $profile?->id,
            'device_id' => $device?->id,
            'type' => $type,
            'ip' => $request->ip(),
        ]);
    }
}
