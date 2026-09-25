<?php

namespace App\Models;

use Database\Factories\LocationSettingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Created with the household (see User::booted).
 *
 * @property Carbon|null $paused_until
 */
#[Fillable(['enabled', 'interval_minutes', 'retention_days', 'share_area', 'paused_until'])]
class LocationSetting extends Model
{
    /** @use HasFactory<LocationSettingFactory> */
    use HasFactory;

    /** @var array<string, mixed> */
    protected $attributes = [
        'enabled' => true,
        'interval_minutes' => 15,
        'retention_days' => 30,
        'share_area' => false,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'interval_minutes' => 'integer',
            'retention_days' => 'integer',
            'share_area' => 'boolean',
            'paused_until' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
