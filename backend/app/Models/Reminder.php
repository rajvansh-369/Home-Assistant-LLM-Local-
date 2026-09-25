<?php

namespace App\Models;

use App\Enums\ReminderStatus;
use App\Enums\ReminderTrigger;
use Database\Factories\ReminderFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * The phone schedules the alarm; Laravel only keeps the list in sync.
 *
 * @property Carbon|null $due_at
 * @property ReminderTrigger $trigger
 * @property ReminderStatus $status
 */
#[Fillable(['client_uuid', 'title', 'due_at', 'trigger', 'status'])]
class Reminder extends Model
{
    /** @use HasFactory<ReminderFactory> */
    use HasFactory, SoftDeletes;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'due_at' => 'datetime',
            'trigger' => ReminderTrigger::class,
            'status' => ReminderStatus::class,
        ];
    }

    /** @return BelongsTo<Profile, $this> */
    public function profile(): BelongsTo
    {
        return $this->belongsTo(Profile::class);
    }
}
