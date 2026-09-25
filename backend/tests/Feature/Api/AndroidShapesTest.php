<?php

use App\Models\Device;
use App\Models\Profile;
use App\Models\User;

/*
| The shapes the Android plan (android/docs/aster-first-run-plan.md §6)
| relies on. Fields beyond these are extras the app ignores.
*/

it('returns token from register and login', function () {
    $register = $this->postJson('/api/auth/register', [
        'name' => 'Rohan', 'email' => 'rohan@example.com', 'password' => 'secret-pass', 'device_name' => 'Pixel 8',
    ])->assertCreated();
    $login = $this->postJson('/api/auth/login', [
        'email' => 'rohan@example.com', 'password' => 'secret-pass', 'device_name' => 'Pixel 8',
    ])->assertOk();

    foreach ([$register, $login] as $response) {
        expect($response->json('token'))->toBeString()->toMatch('/^\d+\|\w+$/')
            ->and($response->json('household_id'))->toMatch('/^h\d+$/');
    }
});

it('returns profile_token, llm_token and expires_at from unlock', function () {
    $household = User::factory()->create();
    $device = Device::factory()->for($household)->create();
    $owner = Profile::factory()->for($household)->owner()->create();

    $response = $this->withToken(deviceToken($household, $device))
        ->postJson("/api/profiles/{$owner->id}/unlock", ['pin' => '123456'])
        ->assertOk();

    expect($response->json('profile_token'))->toMatch('/^\d+\|\w+$/')
        ->and(substr_count($response->json('llm_token'), '.'))->toBe(2)
        ->and($response->json('expires_at'))->toMatch('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/');
});

it('answers 404 from GET /places/home when no home is saved', function () {
    $owner = Profile::factory()->owner()->create();

    $this->withToken(profileToken($owner))->getJson('/api/places/home')->assertNotFound();
});

it('keeps colours as hex, and takes an auto-lock of 2 or null', function (?int $autoLock) {
    $household = User::factory()->create();
    $device = Device::factory()->for($household)->create();

    $this->withToken(deviceToken($household, $device))->postJson('/api/profiles', [
        'name' => 'Rohan', 'color' => '#7FD9B8', 'role' => 'owner', 'pin' => '123456', 'auto_lock_minutes' => $autoLock,
    ])->assertCreated()
        ->assertJsonPath('data.color', '#7FD9B8')
        ->assertJsonPath('data.auto_lock_minutes', $autoLock);

    $this->withToken(deviceToken($household, $device))->getJson('/api/profiles')
        ->assertJsonPath('data.0.color', '#7FD9B8')
        ->assertJsonPath('data.1.color', '#9299A1');
})->with([2, null]);
