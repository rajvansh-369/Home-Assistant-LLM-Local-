<?php

namespace App\Http\Resources;

use App\Models\LocationSetting;
use App\Support\ApiTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin LocationSetting
 */
class LocationSettingResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'enabled' => $this->enabled,
            'interval_minutes' => $this->interval_minutes,
            'retention_days' => $this->retention_days,
            'share_area' => $this->share_area,
            'paused_until' => ApiTime::format($this->paused_until),
            'updated_at' => ApiTime::format($this->updated_at),
        ];
    }
}
