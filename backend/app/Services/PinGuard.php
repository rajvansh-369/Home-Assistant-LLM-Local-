<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Models\Device;
use App\Models\Profile;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Checks a profile's PIN with the limits in docs/aster-backend-plan.md §4:
 * five tries, then a lockout that starts at 30 s and doubles with each
 * further lockout within 24 hours, up to 1 hour.
 */
class PinGuard
{
    public const MAX_TRIES = 5;

    private const FIRST_LOCKOUT_SECONDS = 30;

    private const MAX_LOCKOUT_SECONDS = 3600;

    private const HISTORY_SECONDS = 86400;

    /** Wrong tries are forgotten this long after the first one. */
    private const TRIES_DECAY_SECONDS = 3600;

    public function __construct(private AuthEvents $events) {}

    /**
     * Returns when the PIN is right; otherwise throws the 422 or 429 response.
     *
     * @throws HttpResponseException
     */
    public function check(Profile $profile, string $pin, Request $request, Device $device): void
    {
        $lockKey = $this->lockKey($profile);

        // During a lockout the PIN isn't checked at all.
        if (RateLimiter::tooManyAttempts($lockKey, 1)) {
            throw $this->locked(RateLimiter::availableIn($lockKey));
        }

        if ($profile->pin_hash !== null && Hash::check($pin, $profile->pin_hash)) {
            RateLimiter::clear($this->triesKey($profile));
            $this->events->record(AuthEventType::Unlock, $request, profile: $profile, device: $device);

            return;
        }

        $tries = RateLimiter::hit($this->triesKey($profile), self::TRIES_DECAY_SECONDS);
        $this->events->record(AuthEventType::UnlockFailed, $request, profile: $profile, device: $device);

        if ($tries < self::MAX_TRIES) {
            throw new HttpResponseException(response()->json([
                'message' => 'Wrong PIN.',
                'errors' => ['pin' => ['Wrong PIN.']],
                'attempts_left' => self::MAX_TRIES - $tries,
            ], 422));
        }

        RateLimiter::clear($this->triesKey($profile));
        $seconds = $this->startLockout($profile);
        $this->events->record(AuthEventType::Lockout, $request, profile: $profile, device: $device);

        throw $this->locked($seconds);
    }

    private function startLockout(Profile $profile): int
    {
        $historyKey = "aster:pin-lockouts:{$profile->id}";
        $now = now()->getTimestamp();

        /** @var list<int> $history */
        $history = array_values(array_filter(
            Cache::get($historyKey, []),
            fn (int $at) => $at > $now - self::HISTORY_SECONDS,
        ));

        $seconds = min(self::FIRST_LOCKOUT_SECONDS * 2 ** count($history), self::MAX_LOCKOUT_SECONDS);

        $history[] = $now;
        Cache::put($historyKey, $history, self::HISTORY_SECONDS);
        RateLimiter::hit($this->lockKey($profile), $seconds);

        return $seconds;
    }

    private function locked(int $seconds): HttpResponseException
    {
        $seconds = max(1, $seconds);

        return new HttpResponseException(response()->json([
            'message' => "Too many wrong PINs. Try again in {$seconds} s.",
            'retry_after' => $seconds,
        ], 429, ['Retry-After' => (string) $seconds]));
    }

    private function triesKey(Profile $profile): string
    {
        return "aster:pin-tries:{$profile->id}";
    }

    private function lockKey(Profile $profile): string
    {
        return "aster:pin-lock:{$profile->id}";
    }
}
