<?php

namespace Database\Factories;

use App\Models\Conversation;
use App\Models\Profile;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Conversation>
 */
class ConversationFactory extends Factory
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
            'last_message_at' => fake()->dateTimeBetween('-14 days'),
        ];
    }
}
