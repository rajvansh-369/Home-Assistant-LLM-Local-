<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * A household account: the Owner's login. Every household-owned row traces
 * back to one of these.
 */
#[Fillable(['name', 'email', 'password', 'suspended_at', 'suspension_reason'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected static function booted(): void
    {
        static::created(function (User $user): void {
            $user->locationSettings()->create();
            $user->alertSettings()->create();
        });

        // Sanctum's token table is polymorphic, so the database can't cascade to it.
        static::deleting(function (User $user): void {
            PersonalAccessToken::query()
                ->where(fn ($query) => $query
                    ->where(fn ($q) => $q->where('tokenable_type', $user->getMorphClass())->where('tokenable_id', $user->id))
                    ->orWhere(fn ($q) => $q->where('tokenable_type', (new Profile)->getMorphClass())
                        ->whereIn('tokenable_id', $user->profiles()->withTrashed()->select('id'))))
                ->delete();
        });
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'suspended_at' => 'datetime',
        ];
    }

    /**
     * The id shown to the app, the admin panel and zypherLL's `aud` check, for example "h7".
     */
    public function householdId(): string
    {
        return 'h'.$this->id;
    }

    public function isSuspended(): bool
    {
        return $this->suspended_at !== null;
    }

    /** @return HasMany<Profile, $this> */
    public function profiles(): HasMany
    {
        return $this->hasMany(Profile::class);
    }

    /** @return HasMany<Device, $this> */
    public function devices(): HasMany
    {
        return $this->hasMany(Device::class);
    }

    /** @return HasMany<Place, $this> */
    public function places(): HasMany
    {
        return $this->hasMany(Place::class);
    }

    /** @return HasOne<Place, $this> */
    public function home(): HasOne
    {
        return $this->hasOne(Place::class)->where('name', Place::HOME);
    }

    /** @return HasMany<Location, $this> */
    public function locations(): HasMany
    {
        return $this->hasMany(Location::class);
    }

    /** @return HasOne<LocationSetting, $this> */
    public function locationSettings(): HasOne
    {
        return $this->hasOne(LocationSetting::class);
    }

    /** @return HasOne<AlertSetting, $this> */
    public function alertSettings(): HasOne
    {
        return $this->hasOne(AlertSetting::class);
    }

    /** @return HasMany<VipContact, $this> */
    public function vipContacts(): HasMany
    {
        return $this->hasMany(VipContact::class);
    }

    /** @return HasManyThrough<Conversation, Profile, $this> */
    public function conversations(): HasManyThrough
    {
        return $this->hasManyThrough(Conversation::class, Profile::class);
    }

    /** @return HasManyThrough<Reminder, Profile, $this> */
    public function reminders(): HasManyThrough
    {
        return $this->hasManyThrough(Reminder::class, Profile::class);
    }

    /** @return HasMany<ActivityLog, $this> */
    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }

    /** @return HasMany<AuthEvent, $this> */
    public function authEvents(): HasMany
    {
        return $this->hasMany(AuthEvent::class);
    }

    /** @return HasMany<DeviceActivityDay, $this> */
    public function deviceActivityDays(): HasMany
    {
        return $this->hasMany(DeviceActivityDay::class);
    }
}
