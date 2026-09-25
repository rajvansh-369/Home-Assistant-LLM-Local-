<?php

namespace App\Support;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Who a Sanctum bearer token belongs to. The token table is polymorphic, so
 * $request->user() is a User (device token) or a Profile (profile token),
 * although its declared type names only the default provider's User.
 */
class ApiCaller
{
    public static function of(Request $request): User|Profile|null
    {
        $caller = call_user_func($request->getUserResolver());

        return $caller instanceof User || $caller instanceof Profile ? $caller : null;
    }
}
