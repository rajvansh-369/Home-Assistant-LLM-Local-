<?php

namespace App\Http\Resources;

use App\Models\ChatMessage;
use App\Support\ApiTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A chat message with zypherLL's response fields (§5).
 *
 * @mixin ChatMessage
 */
class MessageResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'client_uuid' => $this->client_uuid,
            'role' => $this->role->value,
            'content' => $this->content,
            'sent_at' => ApiTime::format($this->sent_at),
            'finish_reason' => $this->finish_reason?->value,
            'memory_id' => $this->memory_id,
            'live' => $this->live,
            'cited' => $this->cited,
            'sources' => $this->sources ?? [],
            'recalled' => $this->recalled,
            'sampling' => $this->sampling?->value,
            'usage' => $this->usage,
            'seconds' => $this->seconds === null ? null : (float) $this->seconds,
            'rating' => $this->rating?->value,
            'context' => $this->context ?? [],
            'created_at' => ApiTime::format($this->created_at),
        ];
    }
}
