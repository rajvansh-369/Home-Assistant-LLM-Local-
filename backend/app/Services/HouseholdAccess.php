<?php

namespace App\Services;

use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * The admin panel's Suspend, Unsuspend and Revoke (§6). Each one writes its
 * audit entry. llm_tokens already issued keep working on the home PC until
 * they expire, because zypherLL checks them offline.
 */
class HouseholdAccess
{
    /**
     * Blocks the household from the API and ends every session on every phone.
     */
    public static function suspend(User $household, string $reason): void
    {
        DB::transaction(function () use ($household, $reason): void {
            $household->forceFill(['suspended_at' => now(), 'suspension_reason' => $reason])->save();

            self::tokens($household)->delete();
            $household->devices()->whereNull('signed_out_at')->update(['signed_out_at' => now()]);

            AdminAudit::record(AdminAudit::HOUSEHOLD_SUSPENDED, $household, meta: ['reason' => $reason]);
        });
    }

    /**
     * Lets the household in again. Each phone then signs in again.
     */
    public static function unsuspend(User $household): void
    {
        DB::transaction(function () use ($household): void {
            $household->forceFill(['suspended_at' => null, 'suspension_reason' => null])->save();

            AdminAudit::record(AdminAudit::HOUSEHOLD_UNSUSPENDED, $household);
        });
    }

    /**
     * Signs one phone out: its device token and every profile token opened on it.
     */
    public static function revoke(Device $device): void
    {
        DB::transaction(function () use ($device): void {
            self::tokens($device->user, 'device:'.$device->id)->delete();
            $device->forceFill(['signed_out_at' => now()])->save();

            AdminAudit::record(AdminAudit::DEVICE_REVOKED, $device->user, $device);
        });
    }

    /**
     * The household's device tokens and its profiles' tokens, deleted profiles
     * included. Both kinds are named "device:{device_id}".
     *
     * @return Builder<PersonalAccessToken>
     */
    private static function tokens(User $household, ?string $name = null): Builder
    {
        return PersonalAccessToken::query()
            ->where(fn (Builder $query) => $query
                ->where(fn (Builder $q) => $q->where('tokenable_type', $household->getMorphClass())->where('tokenable_id', $household->id))
                ->orWhere(fn (Builder $q) => $q->where('tokenable_type', (new Profile)->getMorphClass())
                    ->whereIn('tokenable_id', $household->profiles()->withTrashed()->select('id'))))
            ->when($name !== null, fn (Builder $query) => $query->where('name', $name));
    }
}
