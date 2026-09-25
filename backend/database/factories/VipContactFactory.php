<?php

namespace Database\Factories;

use App\Enums\MessageSource;
use App\Models\User;
use App\Models\VipContact;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<VipContact>
 */
class VipContactFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->firstName();

        return [
            'user_id' => User::factory(),
            'name' => $name,
            'match_key' => $name,
            'sources' => [MessageSource::Whatsapp->value, MessageSource::Sms->value],
            'enabled' => true,
        ];
    }
}
