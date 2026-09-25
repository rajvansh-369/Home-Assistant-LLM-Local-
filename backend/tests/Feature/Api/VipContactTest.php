<?php

use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use App\Models\VipContact;

beforeEach(function () {
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->owner = Profile::factory()->for($this->household)->owner()->create();
    $this->token = profileToken($this->owner, $this->device);
});

it('creates, lists, updates and soft-deletes contacts', function () {
    $created = $this->withToken($this->token)->postJson('/api/vip-contacts', [
        'name' => 'Mom', 'match_key' => 'Mom', 'sources' => ['whatsapp', 'sms'],
    ])->assertCreated()
        ->assertJsonPath('data.name', 'Mom')
        ->assertJsonPath('data.sources', ['whatsapp', 'sms'])
        ->assertJsonPath('data.enabled', true);
    $id = $created->json('data.id');

    $this->withToken($this->token)->getJson('/api/vip-contacts')->assertOk()->assertJsonPath('data.*.id', [$id]);

    $this->withToken($this->token)->patchJson("/api/vip-contacts/{$id}", ['enabled' => false, 'sources' => ['google_chat']])
        ->assertOk()->assertJsonPath('data.enabled', false)->assertJsonPath('data.sources', ['google_chat'])->assertJsonPath('data.name', 'Mom');

    $this->withToken($this->token)->deleteJson("/api/vip-contacts/{$id}")->assertNoContent();

    expect(VipContact::withTrashed()->find($id)->trashed())->toBeTrue();
    $this->withToken($this->token)->getJson('/api/vip-contacts')->assertJsonPath('data', []);
});

it('validates contacts', function (array $fields, string $error) {
    $this->withToken($this->token)->postJson('/api/vip-contacts', array_merge(['name' => 'Mom', 'match_key' => 'Mom', 'sources' => ['sms']], $fields))
        ->assertUnprocessable()->assertJsonValidationErrors($error);
})->with([
    'no sources' => [['sources' => []], 'sources'],
    'unknown source' => [['sources' => ['telegram']], 'sources.0'],
    'long name' => [['name' => str_repeat('a', 61)], 'name'],
    'long match key' => [['match_key' => str_repeat('a', 121)], 'match_key'],
]);

it('answers 404 for another household\'s contact', function () {
    $theirs = VipContact::factory()->create();

    $this->withToken($this->token)->patchJson("/api/vip-contacts/{$theirs->id}", ['enabled' => false])->assertNotFound();
    $this->withToken($this->token)->deleteJson("/api/vip-contacts/{$theirs->id}")->assertNotFound();
});

it('is for the Owner only', function () {
    $member = Profile::factory()->for($this->household)->member()->create();

    $this->withToken(profileToken($member, $this->device))->getJson('/api/vip-contacts')->assertForbidden();
});
