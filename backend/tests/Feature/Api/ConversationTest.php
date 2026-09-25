<?php

use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->owner = Profile::factory()->for($this->household)->owner()->create();
    $this->token = profileToken($this->owner, $this->device);
});

describe('store', function () {
    it('creates a conversation, then answers retries with the same row', function () {
        $uuid = (string) Str::uuid();

        $first = $this->withToken($this->token)->postJson('/api/conversations', ['client_uuid' => $uuid, 'title' => 'Dinner ideas']);
        $retry = $this->withToken($this->token)->postJson('/api/conversations', ['client_uuid' => $uuid, 'title' => 'Dinner ideas']);

        $first->assertCreated()
            ->assertJsonPath('data.client_uuid', $uuid)
            ->assertJsonPath('data.profile_id', $this->owner->id)
            ->assertJsonPath('data.title', 'Dinner ideas')
            ->assertJsonPath('data.last_message_at', null)
            ->assertJsonPath('data.message_count', 0);
        $retry->assertOk()->assertJsonPath('data.id', $first->json('data.id'));

        expect(Conversation::count())->toBe(1);
    });

    it('refuses another profile\'s client_uuid', function () {
        $other = Conversation::factory()->create();

        $this->withToken($this->token)->postJson('/api/conversations', ['client_uuid' => $other->client_uuid, 'title' => 'Mine'])
            ->assertUnprocessable()->assertJsonValidationErrors('client_uuid');
    });

    it('validates the request', function () {
        $this->withToken($this->token)->postJson('/api/conversations', ['client_uuid' => 'nope', 'title' => str_repeat('a', 121)])
            ->assertUnprocessable()->assertJsonValidationErrors(['client_uuid', 'title']);
    });
});

describe('index', function () {
    it('lists the profile\'s conversations newest first with message counts', function () {
        $old = Conversation::factory()->for($this->owner)->create(['updated_at' => now()->subDay()]);
        $new = Conversation::factory()->for($this->owner)->create(['updated_at' => now()]);
        ChatMessage::factory()->for($new)->count(3)->create();
        Conversation::factory()->create(); // another profile's

        $response = $this->withToken($this->token)->getJson('/api/conversations');

        $response->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.id', $new->id)
            ->assertJsonPath('data.0.message_count', 3)
            ->assertJsonPath('data.1.id', $old->id)
            ->assertJsonPath('meta.next_cursor', null)
            ->assertJsonMissingPath('deleted');
    });

    it('pages with a cursor', function () {
        Conversation::factory()->for($this->owner)->count(55)->create();

        $first = $this->withToken($this->token)->getJson('/api/conversations')->assertJsonCount(50, 'data');
        $cursor = $first->json('meta.next_cursor');
        $second = $this->withToken($this->token)->getJson('/api/conversations?cursor='.$cursor)->assertJsonCount(5, 'data');

        expect($cursor)->toBeString()
            ->and($second->json('meta.next_cursor'))->toBeNull()
            ->and(array_intersect($first->json('data.*.id'), $second->json('data.*.id')))->toBeEmpty();
    });

    it('returns only changes and deleted ids since a time', function () {
        $this->travelTo('2026-09-24 10:00:00');
        $unchanged = Conversation::factory()->for($this->owner)->create();
        $gone = Conversation::factory()->for($this->owner)->create();

        $this->travelTo('2026-09-24 11:00:00');
        $changed = Conversation::factory()->for($this->owner)->create();
        $gone->delete();

        $this->withToken($this->token)->getJson('/api/conversations?since=2026-09-24T10:30:00Z')
            ->assertOk()
            ->assertJsonPath('data.*.id', [$changed->id])
            ->assertJsonPath('deleted', [$gone->id]);

        expect($unchanged->exists)->toBeTrue();
    });
});

describe('destroy', function () {
    it('removes the messages at once and lists the id in deleted', function () {
        $this->travelTo('2026-09-24 10:00:00');
        $conversation = Conversation::factory()->for($this->owner)->create();
        ChatMessage::factory()->for($conversation)->count(2)->create();

        $this->travelTo('2026-09-24 11:00:00');
        $this->withToken($this->token)->deleteJson("/api/conversations/{$conversation->id}")->assertNoContent();

        expect(ChatMessage::count())->toBe(0)
            ->and(Conversation::withTrashed()->find($conversation->id)->trashed())->toBeTrue();

        $this->withToken($this->token)->getJson('/api/conversations?since=2026-09-24T10:30:00Z')
            ->assertJsonPath('deleted', [$conversation->id])
            ->assertJsonCount(0, 'data');
        $this->withToken($this->token)->deleteJson("/api/conversations/{$conversation->id}")->assertNotFound();
    });

    it('refuses to re-create a deleted conversation', function () {
        $conversation = Conversation::factory()->for($this->owner)->create();
        $conversation->delete();

        $this->withToken($this->token)->postJson('/api/conversations', ['client_uuid' => $conversation->client_uuid, 'title' => 'Again'])
            ->assertUnprocessable()->assertJsonPath('errors.client_uuid.0', 'This conversation was deleted.');
    });
});

it('answers 404 for another profile\'s conversation, in this household too', function () {
    $member = Profile::factory()->for($this->household)->member()->create();
    $theirs = Conversation::factory()->for($member)->create();
    ChatMessage::factory()->for($theirs)->create();

    $this->withToken($this->token)->deleteJson("/api/conversations/{$theirs->id}")->assertNotFound();
    $this->withToken($this->token)->getJson("/api/conversations/{$theirs->id}/messages")->assertNotFound();

    expect($theirs->fresh()->trashed())->toBeFalse();
});
