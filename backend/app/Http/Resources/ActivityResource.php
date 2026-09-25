<?php

namespace App\Http\Resources;

use App\Models\ActivityLog;
use App\Support\ApiTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ActivityLog
 */
class ActivityResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'profile_id' => $this->profile_id,
            'device_id' => $this->device_id,
            'type' => $this->type,
            'summary' => $this->summary,
            'meta' => $this->meta ?? (object) [],
            'occurred_at' => ApiTime::format($this->occurred_at),
        ];
    }
}
