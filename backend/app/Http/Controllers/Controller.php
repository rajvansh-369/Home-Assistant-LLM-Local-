<?php

namespace App\Http\Controllers;

use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use App\Support\ApiCaller;
use Illuminate\Http\Request;

abstract class Controller
{
    /**
     * The device the request's token was issued to, set by the device and profile middleware.
     */
    protected function device(Request $request): Device
    {
        return $request->attributes->get('device');
    }

    /**
     * The unlocked profile, on routes behind the "profile" middleware.
     */
    protected function profile(Request $request): Profile
    {
        /** @var Profile */
        return ApiCaller::of($request);
    }

    /**
     * The household the token belongs to, for either token type.
     */
    protected function household(Request $request): User
    {
        $caller = ApiCaller::of($request);

        /** @var User */
        return $caller instanceof Profile ? $caller->user : $caller;
    }
}
