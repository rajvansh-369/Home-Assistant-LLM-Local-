<?php

use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\JwtFixture;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| Feature tests run on Laravel's TestCase against the aster_testing MySQL
| database (see phpunit.xml), each test inside a rolled-back transaction.
|
*/

pest()->extend(TestCase::class)->use(RefreshDatabase::class)->in('Feature');

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

/**
 * A device token for the household, as register and login issue it.
 */
function deviceToken(User $household, ?Device $device = null): string
{
    $device ??= Device::factory()->for($household)->create();

    return $household->createToken('device:'.$device->id, ['device'])->plainTextToken;
}

/**
 * A profile token issued on one of the household's devices, as unlock issues it.
 */
function profileToken(Profile $profile, ?Device $device = null): string
{
    $device ??= Device::factory()->for($profile->user)->create();

    return $profile->createToken('device:'.$device->id, ['profile'], now()->addHours(12))->plainTextToken;
}

/**
 * The claims of an llm_token, verified with the test fixture's public key.
 *
 * @return array<string, mixed>
 */
function llmClaims(string $token): array
{
    JWT::$timestamp = now()->getTimestamp(); // follow travelTo() rather than the real clock

    return (array) JWT::decode($token, new Key((string) file_get_contents(JwtFixture::publicKeyPath()), 'RS256'));
}

/**
 * Laravel keeps the resolved user between requests in one test; forget it
 * so the next request authenticates from its own token.
 */
function forgetAuth(): void
{
    app('auth')->forgetGuards();
}
