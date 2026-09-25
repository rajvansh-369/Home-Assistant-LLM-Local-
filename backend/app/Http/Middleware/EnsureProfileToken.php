<?php

namespace App\Http\Middleware;

use App\Models\Profile;
use App\Services\DeviceTracker;
use App\Support\ApiCaller;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * The request carries an unlocked profile's token, the profile isn't
 * deleted and its household isn't suspended. Puts the token's Device on the
 * request as "device".
 */
class EnsureProfileToken
{
    public function __construct(private DeviceTracker $tracker) {}

    public function handle(Request $request, Closure $next): Response
    {
        $profile = ApiCaller::of($request);
        $token = $profile?->currentAccessToken();

        if (! $profile instanceof Profile || ! $token instanceof PersonalAccessToken || ! $token->can('profile')) {
            abort(403, 'This needs an unlocked profile.');
        }

        $household = $profile->user;
        if ($profile->trashed() || $household === null) {
            throw new AuthenticationException;
        }

        if ($household->isSuspended()) {
            abort(403, 'This account is suspended.');
        }

        $device = $this->tracker->deviceFor($token, $household) ?? throw new AuthenticationException;

        $this->tracker->track($request, $device);
        $request->attributes->set('device', $device);

        return $next($request);
    }
}
