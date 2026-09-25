<?php

namespace App\Http\Resources;

use App\Models\Profile;
use App\Support\ApiTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The full Profile shape from §5. Never includes the PIN hash.
 *
 * @mixin Profile
 */
class ProfileResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'color' => $this->color,
            'role' => $this->role->value,
            'has_pin' => $this->hasPin(),
            'personality' => $this->personality,
            'web_mode' => $this->web_mode->value,
            'memory_enabled' => $this->memory_enabled,
            'sampling' => $this->sampling->value,
            'max_tokens' => $this->max_tokens,
            'auto_lock_minutes' => $this->auto_lock_minutes,
            'created_at' => ApiTime::format($this->created_at),
            'updated_at' => ApiTime::format($this->updated_at),
        ];
    }
}
