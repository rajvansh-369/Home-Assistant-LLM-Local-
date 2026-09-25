<?php

namespace App\Models;

use Database\Factories\DeviceActivityDayFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\WithoutTimestamps;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One row per device per day it called the API. day is the date in
 * ASTER_ADMIN_TIMEZONE.
 *
 * @property Carbon $day
 */
#[Fillable(['user_id', 'device_id', 'day'])]
#[WithoutTimestamps]
class DeviceActivityDay extends Model
{
    /** @use HasFactory<DeviceActivityDayFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'day' => 'date',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<Device, $this> */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }
}
