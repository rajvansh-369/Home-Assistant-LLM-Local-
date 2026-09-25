<?php

use App\Models\Device;
use App\Models\Profile;
use App\Models\Reminder;
use App\Models\User;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->member = Profile::factory()->for($this->household)->member()->create();
    $this->token = profileToken($this->member, $this->device);
});

it('creates a reminder, then answers retries with the same row', function () {
    $fields = ['client_uuid' => (string) Str::uuid(), 'title' => 'Pay the bill', 'trigger' => 'time', 'due_at' => '2026-09-25T10:00:00+05:30'];

    $first = $this->withToken($this->token)->postJson('/api/reminders', $fields)
        ->assertCreated()
        ->assertJsonPath('data.title', 'Pay the bill')
        ->assertJsonPath('data.due_at', '2026-09-25T04:30:00Z')
        ->assertJsonPath('data.status', 'pending');
    $this->withToken($this->token)->postJson('/api/reminders', $fields)->assertOk()->assertJsonPath('data.id', $first->json('data.id'));

    expect(Reminder::count())->toBe(1);
});

it('needs due_at for a time reminder but not for arrive_home', function () {
    $this->withToken($this->token)->postJson('/api/reminders', ['client_uuid' => (string) Str::uuid(), 'title' => 'X', 'trigger' => 'time'])
        ->assertUnprocessable()->assertJsonValidationErrors('due_at');
    $this->withToken($this->token)->postJson('/api/reminders', ['client_uuid' => (string) Str::uuid(), 'title' => 'Water the plants', 'trigger' => 'arrive_home'])
        ->assertCreated()->assertJsonPath('data.due_at', null);
});

it('lists, updates and soft-deletes the profile\'s own reminders', function () {
    $mine = Reminder::factory()->for($this->member)->create();
    Reminder::factory()->create(); // someone else's

    $this->withToken($this->token)->getJson('/api/reminders')->assertOk()->assertJsonPath('data.*.id', [$mine->id]);

    $this->withToken($this->token)->patchJson("/api/reminders/{$mine->id}", ['status' => 'done'])
        ->assertOk()->assertJsonPath('data.status', 'done');
    $this->withToken($this->token)->patchJson("/api/reminders/{$mine->id}", ['due_at' => null])
        ->assertUnprocessable()->assertJsonValidationErrors('due_at');
    $this->withToken($this->token)->patchJson("/api/reminders/{$mine->id}", ['trigger' => 'arrive_home', 'due_at' => null])
        ->assertOk()->assertJsonPath('data.trigger', 'arrive_home');

    $this->withToken($this->token)->deleteJson("/api/reminders/{$mine->id}")->assertNoContent();
    expect(Reminder::withTrashed()->find($mine->id)->trashed())->toBeTrue();
});

it('answers 404 for another profile\'s reminder', function () {
    $owner = Profile::factory()->for($this->household)->owner()->create();
    $theirs = Reminder::factory()->for($owner)->create();

    $this->withToken($this->token)->patchJson("/api/reminders/{$theirs->id}", ['status' => 'done'])->assertNotFound();
    $this->withToken($this->token)->deleteJson("/api/reminders/{$theirs->id}")->assertNotFound();
});

it('refuses Restricted with 403, ids included', function () {
    $restricted = Profile::factory()->for($this->household)->restricted()->create();
    $token = profileToken($restricted, $this->device);
    $reminder = Reminder::factory()->for($this->member)->create();

    $this->withToken($token)->getJson('/api/reminders')->assertForbidden();
    $this->withToken($token)->postJson('/api/reminders', ['client_uuid' => (string) Str::uuid(), 'title' => 'X', 'trigger' => 'arrive_home'])->assertForbidden();
    $this->withToken($token)->patchJson("/api/reminders/{$reminder->id}", ['status' => 'done'])->assertForbidden();
    $this->withToken($token)->deleteJson("/api/reminders/{$reminder->id}")->assertForbidden();
});

it('refuses Guest', function () {
    $guest = Profile::factory()->for($this->household)->guest()->create();

    $this->withToken(profileToken($guest, $this->device))->getJson('/api/reminders')->assertForbidden();
});
