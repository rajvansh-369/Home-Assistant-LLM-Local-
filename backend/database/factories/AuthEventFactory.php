<?php

namespace Database\Factories;

use App\Enums\AuthEventType;
use App\Models\AuthEvent;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AuthEvent>
 */
class AuthEventFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'type' => fake()->randomElement(AuthEventType::cases()),
            'ip' => fake()->ipv4(),
            'created_at' => fake()->dateTimeBetween('-7 days'),
        ];
    }
}
