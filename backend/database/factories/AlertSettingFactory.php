<?php

namespace Database\Factories;

use App\Enums\SpeakMode;
use App\Models\AlertSetting;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Households get this row automatically; use the factory only for a user
 * created without model events.
 *
 * @extends Factory<AlertSetting>
 */
class AlertSettingFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'enabled' => true,
            'missed_after_minutes' => 10,
            'speak_mode' => SpeakMode::Full,
            'urgent_keywords' => ['urgent', 'emergency'],
            'headphones_only' => false,
            'only_at_home' => false,
        ];
    }
}
