<?php

namespace App\Models;

use App\Enums\LlmEngine;
use App\Enums\ProfileRole;
use App\Enums\Sampling;
use App\Enums\WebMode;
use Database\Factories\ProfileFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Laravel\Sanctum\HasApiTokens;

/**
 * @property ProfileRole $role
 * @property WebMode $web_mode
 * @property Sampling $sampling
 * @property LlmEngine $llm_engine
 */
#[Fillable([
    'name', 'color', 'role', 'pin_hash', 'personality', 'web_mode', 'memory_enabled',
    'sampling', 'llm_engine', 'max_tokens', 'auto_lock_minutes', 'last_unlocked_at',
])]
#[Hidden(['pin_hash'])]
class Profile extends Model
{
    /** @use HasFactory<ProfileFactory> */
    use HasApiTokens, HasFactory, SoftDeletes;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'role' => ProfileRole::class,
            'web_mode' => WebMode::class,
            'sampling' => Sampling::class,
            'llm_engine' => LlmEngine::class,
            'memory_enabled' => 'boolean',
            'max_tokens' => 'integer',
            'auto_lock_minutes' => 'integer',
            'last_unlocked_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<Conversation, $this> */
    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }

    /** @return HasMany<Reminder, $this> */
    public function reminders(): HasMany
    {
        return $this->hasMany(Reminder::class);
    }

    /** @return HasMany<ActivityLog, $this> */
    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }

    public function isOwner(): bool
    {
        return $this->role === ProfileRole::Owner;
    }

    public function isGuest(): bool
    {
        return $this->role === ProfileRole::Guest;
    }

    public function hasPin(): bool
    {
        return $this->pin_hash !== null;
    }
}
