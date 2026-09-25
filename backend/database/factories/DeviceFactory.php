<?php

namespace Database\Factories;

use App\Models\Device;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Device>
 */
class DeviceFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => fake()->randomElement(['Pixel 8', 'Galaxy S24', 'OnePlus 12', 'Redmi Note 13', 'Moto G84']),
            'app_version' => fake()->randomElement(['1.0.0', '1.0.1', '1.1.0']),
            'last_seen_at' => fake()->dateTimeBetween('-30 days'),
        ];
    }

    public function seenToday(): static
    {
        return $this->state(['last_seen_at' => now()]);
    }

    public function signedOut(): static
    {
        return $this->state(['signed_out_at' => now()]);
    }
}
