<?php

namespace App\Http\Middleware;

use App\Enums\ProfileRole;
use App\Models\Profile;
use App\Support\ApiCaller;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restricted profiles have no reminders (§4). Runs after "not-guest".
 */
class EnsureCanUseReminders
{
    public function handle(Request $request, Closure $next): Response
    {
        $profile = ApiCaller::of($request);

        if (! $profile instanceof Profile || $profile->role === ProfileRole::Restricted) {
            abort(403, 'Restricted profiles can\'t use reminders.');
        }

        return $next($request);
    }
}
