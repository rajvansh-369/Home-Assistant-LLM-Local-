<?php

namespace Database\Factories;

use App\Enums\ReminderStatus;
use App\Enums\ReminderTrigger;
use App\Models\Profile;
use App\Models\Reminder;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Reminder>
 */
class ReminderFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'profile_id' => Profile::factory(),
            'client_uuid' => fake()->uuid(),
            'title' => rtrim(fake()->sentence(4), '.'),
            'due_at' => fake()->dateTimeBetween('now', '+7 days'),
            'trigger' => ReminderTrigger::Time,
            'status' => ReminderStatus::Pending,
        ];
    }

    public function arriveHome(): static
    {
        return $this->state(['trigger' => ReminderTrigger::ArriveHome, 'due_at' => null]);
    }

    public function done(): static
    {
        return $this->state(['status' => ReminderStatus::Done]);
    }
}
