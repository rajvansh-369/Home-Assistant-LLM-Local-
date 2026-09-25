<?php

namespace App\Http\Resources;

use App\Models\Place;
use App\Support\ApiTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Place
 */
class PlaceResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'address' => $this->address,
            'lat' => (float) $this->lat,
            'lng' => (float) $this->lng,
            'radius_m' => $this->radius_m,
            'wifi_ssid' => $this->wifi_ssid,
            'llm_url' => $this->llm_url,
            'updated_at' => ApiTime::format($this->updated_at),
        ];
    }
}
