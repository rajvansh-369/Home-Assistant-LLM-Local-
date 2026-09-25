<?php

namespace Database\Factories;

use App\Models\LocationSetting;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Households get this row automatically; use the factory only for a user
 * created without model events.
 *
 * @extends Factory<LocationSetting>
 */
class LocationSettingFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'enabled' => true,
            'interval_minutes' => 15,
            'retention_days' => 30,
            'share_area' => false,
        ];
    }
}
