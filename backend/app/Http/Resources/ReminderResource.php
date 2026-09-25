<?php

namespace App\Http\Resources;

use App\Models\Reminder;
use App\Support\ApiTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Reminder
 */
class ReminderResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'client_uuid' => $this->client_uuid,
            'title' => $this->title,
            'due_at' => ApiTime::format($this->due_at),
            'trigger' => $this->trigger->value,
            'status' => $this->status->value,
            'created_at' => ApiTime::format($this->created_at),
            'updated_at' => ApiTime::format($this->updated_at),
        ];
    }
}
