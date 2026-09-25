<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\DeviceTracker;
use App\Support\ApiCaller;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * The request carries a household's device token, and the household isn't
 * suspended. Puts the token's Device on the request as "device".
 */
class EnsureDeviceToken
{
    public function __construct(private DeviceTracker $tracker) {}

    public function handle(Request $request, Closure $next): Response
    {
        $household = ApiCaller::of($request);
        $token = $household?->currentAccessToken();

        if (! $household instanceof User || ! $token instanceof PersonalAccessToken || ! $token->can('device')) {
            abort(403, 'This needs a device token.');
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
