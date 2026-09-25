<?php

namespace App\Models;

use App\Enums\FinishReason;
use App\Enums\MessageRole;
use App\Enums\Rating;
use App\Enums\Sampling;
use Database\Factories\ChatMessageFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Mirrors zypherLL's response fields. content is encrypted at rest; context
 * holds flags about what the app added to the prompt, never message text.
 *
 * @property MessageRole $role
 * @property string $content
 * @property Carbon $sent_at
 * @property FinishReason|null $finish_reason
 * @property Sampling|null $sampling
 * @property Rating|null $rating
 * @property array<int, array<string, mixed>>|null $sources
 * @property array<string, int>|null $usage
 * @property list<string>|null $context
 */
#[Fillable([
    'client_uuid', 'role', 'content', 'sent_at', 'finish_reason', 'memory_id', 'live', 'cited',
    'sources', 'recalled', 'sampling', 'usage', 'seconds', 'rating', 'context',
])]
class ChatMessage extends Model
{
    /** @use HasFactory<ChatMessageFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'role' => MessageRole::class,
            'content' => 'encrypted',
            'sent_at' => 'datetime',
            'finish_reason' => FinishReason::class,
            'live' => 'boolean',
            'cited' => 'boolean',
            'sources' => 'array',
            'memory_id' => 'integer',
            'recalled' => 'integer',
            'sampling' => Sampling::class,
            'usage' => 'array',
            'seconds' => 'decimal:2',
            'rating' => Rating::class,
            'context' => 'array',
        ];
    }

    /** @return BelongsTo<Conversation, $this> */
    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }
}
