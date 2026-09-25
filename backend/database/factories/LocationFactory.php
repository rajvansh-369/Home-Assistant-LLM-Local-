<?php

namespace Database\Factories;

use App\Enums\LocationEvent;
use App\Models\Device;
use App\Models\Location;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Location>
 */
class LocationFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'device_id' => Device::factory(),
            'user_id' => fn (array $attributes) => Device::find($attributes['device_id'])?->user_id,
            'client_uuid' => fake()->uuid(),
            'lat' => fake()->latitude(8, 30),
            'lng' => fake()->longitude(70, 88),
            'accuracy_m' => fake()->randomFloat(2, 3, 60),
            'event' => LocationEvent::Periodic,
            'recorded_at' => fake()->dateTimeBetween('-1 day'),
        ];
    }
}
