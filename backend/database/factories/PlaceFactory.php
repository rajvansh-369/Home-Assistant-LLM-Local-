<?php

namespace Database\Factories;

use App\Models\Place;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Place>
 */
class PlaceFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => fake()->unique()->word(),
            'address' => fake()->address(),
            'lat' => fake()->latitude(8, 30),
            'lng' => fake()->longitude(70, 88),
            'radius_m' => 150,
        ];
    }

    public function home(): static
    {
        return $this->state([
            'name' => Place::HOME,
            'wifi_ssid' => 'HomeNet',
            'llm_url' => 'http://192.168.1.20:8000',
        ]);
    }
}
