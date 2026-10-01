<?php

namespace App\Services;

use App\Http\Resources\ProfileResource;
use App\Models\Device;
use App\Models\Profile;
use App\Support\ApiTime;
use App\Support\EngineNames;

/**
 * Opens a profile on a device: a profile token plus a matching llm_token,
 * in the shape unlock and guest-sessions return (§5), with the names the
 * admin panel gave the assistant engines for the app's engine picker.
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

        // Without chat the profile still unlocks (reminders, settings), but gets no llm_token.
        $llm = $profile->chat_enabled ? $this->llmTokens->issue($profile, $expiresAt) : null;

        return [
            'profile_token' => $profileToken,
            'llm_token' => $llm['token'] ?? null,
            'expires_at' => ApiTime::format($llm['expires_at'] ?? $expiresAt),
            'household_id' => $profile->user->householdId(),
            'profile' => new ProfileResource($profile),
            'engines' => EngineNames::list(),
        ];
    }
}
