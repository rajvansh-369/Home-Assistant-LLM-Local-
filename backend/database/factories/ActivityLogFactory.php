<?php

namespace Database\Factories;

use App\Enums\ActivityType;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ActivityLog>
 */
class ActivityLogFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $type = fake()->randomElement(ActivityType::cases());

        return [
            'user_id' => User::factory(),
            'client_uuid' => fake()->uuid(),
            'type' => $type->value,
            'summary' => match ($type) {
                ActivityType::SpokenAlert => 'Read out a message from '.fake()->firstName(),
                ActivityType::ReminderFired => 'Reminder: '.rtrim(fake()->sentence(3), '.'),
                ActivityType::ArrivedHome => 'Arrived home',
                ActivityType::LeftHome => 'Left home',
                ActivityType::ServerProblem => 'Home server did not answer',
                ActivityType::ReplySent => 'Sent a reply to '.fake()->firstName(),
            },
            'meta' => [],
            'occurred_at' => fake()->dateTimeBetween('-7 days'),
        ];
    }

    public function serverProblem(): static
    {
        return $this->state([
            'type' => ActivityType::ServerProblem->value,
            'summary' => 'Home server did not answer',
        ]);
    }
}
