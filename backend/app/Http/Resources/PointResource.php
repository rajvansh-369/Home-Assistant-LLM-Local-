<?php

namespace App\Http\Resources;

use App\Models\Location;
use App\Support\ApiTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Location
 */
class PointResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'lat' => (float) $this->lat,
            'lng' => (float) $this->lng,
            'accuracy_m' => $this->accuracy_m === null ? null : (float) $this->accuracy_m,
            'event' => $this->event->value,
            'place_id' => $this->place_id,
            'recorded_at' => ApiTime::format($this->recorded_at),
        ];
    }
}
