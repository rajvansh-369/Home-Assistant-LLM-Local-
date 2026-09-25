<?php

namespace Database\Factories;

use App\Models\Admin;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use PragmaRX\Google2FA\Google2FA;

/**
 * @extends Factory<Admin>
 */
class AdminFactory extends Factory
{
    protected static ?string $password;

    /** Recovery code every factory admin with MFA can use. */
    public const RECOVERY_CODE = 'recover-me-0000000000';

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'password' => static::$password ??= Hash::make('password'),
            'is_active' => true,
            'remember_token' => Str::random(10),
        ];
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }

    /**
     * An admin who has already set up an authenticator app, as panel tests need.
     * The secret is readable in tests through getAppAuthenticationSecret().
     */
    public function withMfa(): static
    {
        return $this->afterMaking(function (Admin $admin): void {
            $admin->app_authentication_secret = (new Google2FA)->generateSecretKey();
            $admin->app_authentication_recovery_codes = [Hash::make(self::RECOVERY_CODE)];
        });
    }
}
