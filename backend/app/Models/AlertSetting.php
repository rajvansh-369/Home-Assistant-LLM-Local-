<?php

namespace App\Models;

use App\Enums\SpeakMode;
use Database\Factories\AlertSettingFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Created with the household (see User::booted).
 *
 * @property SpeakMode $speak_mode
 * @property list<string>|null $urgent_keywords
 */
#[Fillable([
    'enabled', 'missed_after_minutes', 'speak_mode', 'quiet_start', 'quiet_end',
    'urgent_keywords', 'headphones_only', 'only_at_home',
])]
class AlertSetting extends Model
{
    /** @use HasFactory<AlertSettingFactory> */
    use HasFactory;

    /** @var array<string, mixed> */
    protected $attributes = [
        'enabled' => true,
        'missed_after_minutes' => 10,
        'speak_mode' => 'full',
        'headphones_only' => false,
        'only_at_home' => false,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'enabled' => 'boolean',
            'missed_after_minutes' => 'integer',
            'speak_mode' => SpeakMode::class,
            'urgent_keywords' => 'array',
            'headphones_only' => 'boolean',
            'only_at_home' => 'boolean',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
