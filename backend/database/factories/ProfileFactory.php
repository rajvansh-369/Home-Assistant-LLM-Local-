<?php

namespace Database\Factories;

use App\Enums\ProfileRole;
use App\Enums\Sampling;
use App\Enums\WebMode;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<Profile>
 */
class ProfileFactory extends Factory
{
    /** The PIN every factory profile gets unless told otherwise. */
    public const PIN = '123456';

    /** The colours the app offers. */
    public const COLORS = ['#7FD9B8', '#C7AFF5', '#82C7F0', '#F4B390'];

    public const GUEST_COLOR = '#9299A1';

    protected static ?string $pinHash = null;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => fake()->firstName(),
            'color' => fake()->randomElement(self::COLORS),
            'role' => ProfileRole::Member,
            'pin_hash' => static::$pinHash ??= Hash::make(self::PIN),
            'web_mode' => WebMode::Auto,
            'memory_enabled' => true,
            'sampling' => Sampling::Auto,
        ];
    }

    public function owner(): static
    {
        return $this->state(['role' => ProfileRole::Owner]);
    }

    public function member(): static
    {
        return $this->state(['role' => ProfileRole::Member]);
    }

    public function restricted(): static
    {
        return $this->state(['role' => ProfileRole::Restricted]);
    }

    /**
     * Guest has no PIN and a fixed grey colour.
     */
    public function guest(): static
    {
        return $this->state([
            'name' => 'Guest',
            'color' => self::GUEST_COLOR,
            'role' => ProfileRole::Guest,
            'pin_hash' => null,
            'memory_enabled' => false,
        ]);
    }

    public function withPin(string $pin): static
    {
        return $this->state(['pin_hash' => Hash::make($pin)]);
    }
}
