<?php

namespace App\Services;

use App\Http\Resources\ProfileResource;
use App\Models\Device;
use App\Models\Profile;
use App\Support\ApiTime;

/**
 * Opens a profile on a device: a profile token plus a matching llm_token,
 * in the shape unlock and guest-sessions return (§5).
 */
class ProfileSessions
{
    public function __construct(private LlmTokenIssuer $llmTokens) {}

    /**
     * @return array<string, mixed>
     */
    public function open(Profile $profile, Device $device): array
    {
        $name = 'device:'.$device->id;
        $expiresAt = now()->addHours((int) config('aster.token_hours'));

        // One live session per profile per device.
        $profile->tokens()->where('name', $name)->delete();
        $profileToken = $profile->createToken($name, ['profile'], $expiresAt)->plainTextToken;

        $profile->forceFill(['last_unlocked_at' => now()])->save();

        $llm = $this->llmTokens->issue($profile, $expiresAt);

        return [
            'profile_token' => $profileToken,
            'llm_token' => $llm['token'],
            'expires_at' => ApiTime::format($llm['expires_at']),
            'household_id' => $profile->user->householdId(),
            'profile' => new ProfileResource($profile),
        ];
    }
}
