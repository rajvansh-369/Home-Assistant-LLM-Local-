<?php

namespace App\Services;

use App\Http\Resources\AlertSettingResource;
use App\Http\Resources\LocationSettingResource;
use App\Http\Resources\PlaceResource;
use App\Http\Resources\ProfileSummaryResource;
use App\Http\Resources\ReminderResource;
use App\Http\Resources\VipContactResource;
use App\Models\Profile;
use App\Models\Reminder;
use App\Models\VipContact;
use App\Support\ApiTime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Carbon;

/**
 * Everything the phone keeps in sync for one unlocked profile (§5).
 *
 * Without `since` it returns everything. With `since` (the server_time of
 * the previous sync) the lists hold only rows changed at or after it, plus
 * the ids deleted since then. The home place and both settings rows are
 * small and always sent whole.
 */
class SyncService
{
    /**
     * @return array<string, mixed>
     */
    public function build(Profile $me, ?Carbon $since): array
    {
        // Taken first, so a change made while this runs is sent again next time.
        $serverTime = now();
        $household = $me->user;

        $changed = fn (Relation|Builder $query) => $query
            ->when($since, fn ($q) => $q->where('updated_at', '>=', $since))
            ->orderBy('id')
            ->get();

        $deleted = fn (Builder $trashed) => $since === null ? [] : $trashed
            ->where('deleted_at', '>=', $since)
            ->orderBy('id')
            ->pluck('id')
            ->all();

        $home = $household->home;
        $locationSettings = $household->locationSettings;
        $alertSettings = $household->alertSettings;

        return [
            'server_time' => ApiTime::format($serverTime),
            'household_id' => $household->householdId(),
            'me' => ['id' => $me->id, 'name' => $me->name, 'role' => $me->role->value],
            'profiles' => ProfileSummaryResource::collection($changed($household->profiles()->whereKeyNot($me->id))),
            'home' => $home === null ? null : new PlaceResource($home),
            'location_settings' => $locationSettings === null ? null : new LocationSettingResource($locationSettings),
            'alert_settings' => $alertSettings === null ? null : new AlertSettingResource($alertSettings),
            'vip_contacts' => VipContactResource::collection($changed($household->vipContacts())),
            'reminders' => ReminderResource::collection($changed($me->reminders())),
            'deleted' => [
                'profiles' => $deleted(Profile::onlyTrashed()->where('user_id', $household->id)),
                'reminders' => $deleted(Reminder::onlyTrashed()->where('profile_id', $me->id)),
                'vip_contacts' => $deleted(VipContact::onlyTrashed()->where('user_id', $household->id)),
            ],
        ];
    }
}
