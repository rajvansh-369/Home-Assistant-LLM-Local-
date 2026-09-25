<?php

namespace App\Http\Middleware;

use App\Models\Profile;
use App\Support\ApiCaller;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The unlocked profile isn't Guest. Runs after "profile".
 */
class EnsureNotGuest
{
    public function handle(Request $request, Closure $next): Response
    {
        $profile = ApiCaller::of($request);

        if (! $profile instanceof Profile || $profile->isGuest()) {
            abort(403, 'Guest can\'t do this.');
        }

        return $next($request);
    }
}
