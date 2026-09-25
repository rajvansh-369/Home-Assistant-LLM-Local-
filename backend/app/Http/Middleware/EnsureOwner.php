<?php

namespace App\Http\Middleware;

use App\Models\Profile;
use App\Support\ApiCaller;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The unlocked profile is the household's Owner. Runs after "profile".
 */
class EnsureOwner
{
    public function handle(Request $request, Closure $next): Response
    {
        $profile = ApiCaller::of($request);

        if (! $profile instanceof Profile || ! $profile->isOwner()) {
            abort(403, 'Only the Owner can do this.');
        }

        return $next($request);
    }
}
