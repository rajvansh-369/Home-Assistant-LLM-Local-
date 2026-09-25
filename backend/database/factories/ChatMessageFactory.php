<?php

namespace Database\Factories;

use App\Enums\FinishReason;
use App\Enums\MessageRole;
use App\Enums\Rating;
use App\Enums\Sampling;
use App\Models\ChatMessage;
use App\Models\Conversation;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ChatMessage>
 */
class ChatMessageFactory extends Factory
{
    /**
     * A question from the user.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'conversation_id' => Conversation::factory(),
            'client_uuid' => fake()->uuid(),
            'role' => MessageRole::User,
            'content' => fake()->sentence().'?',
            'sent_at' => now(),
            'live' => false,
            'cited' => false,
            'sources' => [],
            'context' => [],
        ];
    }

    /**
     * An answer from zypherLL, with its response fields.
     */
    public function assistant(): static
    {
        return $this->state(function () {
            $web = fake()->boolean(25);

            return [
                'role' => MessageRole::Assistant,
                'content' => fake()->paragraph(),
                'finish_reason' => fake()->randomElement([
                    FinishReason::Stop, FinishReason::Stop, FinishReason::Stop, FinishReason::Stop,
                    FinishReason::Length, FinishReason::Cancelled, FinishReason::Error,
                ]),
                'memory_id' => fake()->boolean(30) ? fake()->numberBetween(1, 5000) : null,
                'live' => $web,
                'cited' => $web,
                'sources' => $web ? [['n' => 1, 'title' => fake()->sentence(3), 'url' => fake()->url()]] : [],
                'recalled' => fake()->numberBetween(0, 4),
                'sampling' => fake()->randomElement(Sampling::cases()),
                'usage' => [
                    'prompt_tokens' => $prompt = fake()->numberBetween(50, 900),
                    'completion_tokens' => $completion = fake()->numberBetween(20, 400),
                    'total_tokens' => $prompt + $completion,
                ],
                'seconds' => fake()->randomFloat(2, 0.6, 12),
                'rating' => fake()->optional(0.3)->randomElement(Rating::cases()),
            ];
        });
    }
}
