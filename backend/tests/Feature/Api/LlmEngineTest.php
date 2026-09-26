<?php

use App\Enums\LlmEngine;
use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use App\Support\EngineNames;

beforeEach(function () {
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->owner = Profile::factory()->for($this->household)->owner()->create();
    $this->member = Profile::factory()->for($this->household)->member()->create();
});

it('defaults a profile to the local engine', function () {
    $this->withToken(profileToken($this->member))->getJson('/api/me')
        ->assertOk()
        ->assertJsonPath('data.llm_engine', 'local');
});

it('lets a profile pick Mark-L for itself', function () {
    $this->withToken(profileToken($this->member))->patchJson('/api/me', ['llm_engine' => 'markl'])
        ->assertOk()
        ->assertJsonPath('data.llm_engine', 'markl');

    expect($this->member->fresh()->llm_engine)->toBe(LlmEngine::Markl);
});

it('lets the Owner set another profile\'s engine', function () {
    $this->withToken(profileToken($this->owner))->patchJson("/api/profiles/{$this->member->id}", ['llm_engine' => 'markl'])
        ->assertOk()
        ->assertJsonPath('data.llm_engine', 'markl');
});

it('rejects an unknown engine', function () {
    $this->withToken(profileToken($this->member))->patchJson('/api/me', ['llm_engine' => 'gpt'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('llm_engine');
});

it('hands the engine names to the app at unlock', function () {
    $unlock = fn () => $this->withToken(deviceToken($this->household, $this->device))
        ->postJson("/api/profiles/{$this->member->id}/unlock", ['pin' => '123456']);

    $unlock()->assertOk()->assertJsonPath('engines', [
        ['id' => 'local', 'name' => 'Local'],
        ['id' => 'markl', 'name' => 'Mark-L'],
    ]);

    EngineNames::rename(LlmEngine::Markl, 'Aster Pro');

    $unlock()->assertOk()->assertJsonPath('engines.1', ['id' => 'markl', 'name' => 'Aster Pro']);
});
