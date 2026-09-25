<?php

namespace App\Http\Resources;

use App\Models\AlertSetting;
use App\Support\ApiTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin AlertSetting
 */
class AlertSettingResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'enabled' => $this->enabled,
            'missed_after_minutes' => $this->missed_after_minutes,
            'speak_mode' => $this->speak_mode->value,
            'quiet_start' => $this->hhmm($this->quiet_start),
            'quiet_end' => $this->hhmm($this->quiet_end),
            'urgent_keywords' => $this->urgent_keywords ?? [],
            'headphones_only' => $this->headphones_only,
            'only_at_home' => $this->only_at_home,
            'updated_at' => ApiTime::format($this->updated_at),
        ];
    }

    /**
     * The database keeps HH:MM:SS; the API speaks HH:MM.
     */
    private function hhmm(?string $time): ?string
    {
        return $time === null ? null : substr($time, 0, 5);
    }
}
