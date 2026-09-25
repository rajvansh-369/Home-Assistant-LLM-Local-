<?php

use App\Models\Profile;
use Illuminate\Support\Facades\Hash;

beforeEach(function () {
    $this->profile = Profile::factory()->member()->create(['name' => 'Meera']);
    $this->token = profileToken($this->profile);
});

it('shows the unlocked profile', function () {
    $this->withToken($this->token)->getJson('/api/me')
        ->assertOk()
        ->assertJsonPath('data.id', $this->profile->id)
        ->assertJsonPath('data.name', 'Meera')
        ->assertJsonMissingPath('data.pin_hash');
});

it('updates its own settings but not its role', function () {
    $this->withToken($this->token)->patchJson('/api/me', [
        'name' => 'Meera S', 'color' => '#c7aff5', 'personality' => 'Short answers.', 'web_mode' => 'never',
        'memory_enabled' => false, 'sampling' => 'precise', 'max_tokens' => 256, 'auto_lock_minutes' => null,
        'role' => 'owner',
    ])->assertOk()
        ->assertJsonPath('data.name', 'Meera S')
        ->assertJsonPath('data.color', '#C7AFF5')
        ->assertJsonPath('data.web_mode', 'never')
        ->assertJsonPath('data.memory_enabled', false)
        ->assertJsonPath('data.sampling', 'precise')
        ->assertJsonPath('data.role', 'member');
});

it('changes the PIN only with the current PIN', function () {
    $this->withToken($this->token)->patchJson('/api/me', ['pin' => '654321'])
        ->assertUnprocessable()->assertJsonValidationErrors('current_pin');
    $this->withToken($this->token)->patchJson('/api/me', ['pin' => '654321', 'current_pin' => '000000'])
        ->assertUnprocessable()->assertJsonPath('errors.current_pin.0', 'Wrong PIN.');

    expect(Hash::check('123456', $this->profile->fresh()->pin_hash))->toBeTrue();

    $this->withToken($this->token)->patchJson('/api/me', ['pin' => '654321', 'current_pin' => '123456'])->assertOk();

    expect(Hash::check('654321', $this->profile->fresh()->pin_hash))->toBeTrue();
});

it('refuses Guest', function () {
    $guest = Profile::factory()->guest()->create();

    $this->withToken(profileToken($guest))->getJson('/api/me')->assertForbidden();
});
