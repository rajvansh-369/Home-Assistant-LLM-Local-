<?php

namespace App\Policies;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Auth\Access\Response;

/**
 * Who may add, edit and delete profiles (§4, §5). Route bindings already
 * limit {profile} to the caller's household.
 */
class ProfilePolicy
{
    /**
     * A device token may create only the first profile; after that the Owner.
     * POST /profiles runs without the token middleware, so this also checks
     * the token type and suspension.
     */
    public function create(User|Profile $caller): Response
    {
        $household = $caller instanceof User ? $caller : $caller->user;

        if ($household->isSuspended()) {
            return Response::deny('This account is suspended.');
        }

        if ($caller instanceof User) {
            if (! $caller->tokenCan('device')) {
                return Response::deny('This needs a device token.');
            }

            return $caller->profiles()->withTrashed()->exists()
                ? Response::deny('Only the Owner can add profiles.')
                : Response::allow();
        }

        if (! $caller->tokenCan('profile')) {
            return Response::deny('This needs an unlocked profile.');
        }

        return $caller->isOwner() ? Response::allow() : Response::deny('Only the Owner can add profiles.');
    }

    public function update(User|Profile $caller, Profile $profile): Response
    {
        return $this->ownerOf($caller, $profile);
    }

    public function delete(User|Profile $caller, Profile $profile): Response
    {
        return $this->ownerOf($caller, $profile);
    }

    private function ownerOf(User|Profile $caller, Profile $profile): Response
    {
        return $caller instanceof Profile && $caller->isOwner() && $caller->user_id === $profile->user_id
            ? Response::allow()
            : Response::deny('Only the Owner can do this.');
    }
}
