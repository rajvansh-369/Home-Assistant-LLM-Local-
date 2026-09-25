<?php

namespace App\Http\Resources;

use App\Models\Conversation;
use App\Support\ApiTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Conversation
 */
class ConversationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'client_uuid' => $this->client_uuid,
            'profile_id' => $this->profile_id,
            'title' => $this->title,
            'last_message_at' => ApiTime::format($this->last_message_at),
            'message_count' => $this->messages_count ?? $this->messages()->count(),
            'created_at' => ApiTime::format($this->created_at),
            'updated_at' => ApiTime::format($this->updated_at),
        ];
    }
}
