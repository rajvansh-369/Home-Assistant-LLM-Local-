<?php

namespace Database\Factories;

use App\Models\Device;
use App\Models\DeviceActivityDay;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DeviceActivityDay>
 */
class DeviceActivityDayFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'device_id' => Device::factory(),
            'user_id' => fn (array $attributes) => Device::find($attributes['device_id'])?->user_id,
            'day' => now(config('aster.admin.timezone'))->toDateString(),
        ];
    }
}
