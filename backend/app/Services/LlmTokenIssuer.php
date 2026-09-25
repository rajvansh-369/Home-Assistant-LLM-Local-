<?php

namespace App\Services;

use App\Enums\ProfileRole;
use App\Models\Profile;
use App\Support\JwtKeys;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use Firebase\JWT\JWT;

/**
 * Signs the RS256 llm_token that opens a profile's memory on the home PC.
 * The claims are fixed by docs/aster-backend-plan.md §4 and §7; change them
 * only together with zypherLL.
 */
class LlmTokenIssuer
{
    /**
     * @param  DateTimeInterface|null  $notAfter  the profile token's expiry; the llm_token never outlives it
     * @return array{token: string, expires_at: CarbonImmutable}
     */
    public function issue(Profile $profile, ?DateTimeInterface $notAfter = null): array
    {
        $now = CarbonImmutable::now();
        $expiresAt = $now->addHours((int) config('aster.token_hours'));

        if ($notAfter !== null && $notAfter < $expiresAt) {
            $expiresAt = CarbonImmutable::instance($notAfter);
        }

        $claims = [
            'iss' => config('aster.jwt.issuer'),
            'aud' => $profile->user->householdId(),
            'sub' => 'profile:'.$profile->id,
            'scope' => 'p'.$profile->id,
            'web' => $profile->role->allowsWeb() ? $profile->web_mode->value : 'never',
            'memory' => $profile->role !== ProfileRole::Guest && $profile->memory_enabled,
            'iat' => $now->getTimestamp(),
            'exp' => $expiresAt->getTimestamp(),
        ];

        return [
            'token' => JWT::encode($claims, JwtKeys::privateKey(), 'RS256'),
            'expires_at' => $expiresAt,
        ];
    }
}
