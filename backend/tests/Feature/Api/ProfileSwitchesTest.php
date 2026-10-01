<?php

use App\Models\ActivityLog;
use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Support\Str;

/*
| What the app's profiles plan (android/docs/aster-profiles-memory-plan.md §2)
| asked of Laravel: B1 GET /profiles/{id}, B2 the Guest switch, B3 "Keep chat
| history", B4 "Chat with Aster", B5 DELETE /activity, B6 DELETE /conversations.
*/

beforeEach(function () {
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->deviceToken = deviceToken($this->household, $this->device);
    $this->owner = Profile::factory()->for($this->household)->owner()->create();
    $this->member = Profile::factory()->for($this->household)->member()->create(['name' => 'Asha']);
    $this->guest = Profile::factory()->for($this->household)->guest()->create();
    $this->ownerToken = profileToken($this->owner, $this->device);
});

describe('B1: the Owner reads a profile', function () {
    it('returns the full profile, with the switches', function () {
        $this->withToken($this->ownerToken)->getJson("/api/profiles/{$this->member->id}")
            ->assertOk()
            ->assertJsonPath('data.name', 'Asha')
            ->assertJsonPath('data.sampling', 'auto')
            ->assertJsonPath('data.chat_enabled', true)
            ->assertJsonPath('data.history_enabled', true)
            ->assertJsonMissingPath('data.pin_hash');
    });

    it('is the Owner\'s only', function () {
        $this->withToken(profileToken($this->member, $this->device))
            ->getJson("/api/profiles/{$this->owner->id}")
            ->assertForbidden();
    });
});

describe('B2: Allow guest sessions', function () {
    it('closes guest sessions and ends the open ones when off', function () {
        $open = profileToken($this->guest, $this->device);

        $this->withToken($this->ownerToken)
            ->patchJson("/api/profiles/{$this->guest->id}", ['chat_enabled' => false])
            ->assertOk()->assertJsonPath('data.chat_enabled', false);
        forgetAuth();

        $this->withToken($this->deviceToken)->postJson('/api/guest-sessions')
            ->assertForbidden()->assertJsonPath('message', 'Guest sessions are turned off.');
        forgetAuth();
        $this->withToken($open)->postJson('/api/llm-token')->assertUnauthorized();
        forgetAuth();

        $this->withToken($this->deviceToken)->getJson('/api/profiles')
            ->assertJsonFragment(['id' => $this->guest->id, 'role' => 'guest', 'chat_enabled' => false]);
    });

    it('opens again when on', function () {
        $this->guest->update(['chat_enabled' => false]);
        $this->withToken($this->ownerToken)
            ->patchJson("/api/profiles/{$this->guest->id}", ['chat_enabled' => true])->assertOk();
        forgetAuth();

        $this->withToken($this->deviceToken)->postJson('/api/guest-sessions')
            ->assertOk()->assertJsonPath('profile.role', 'guest');
    });
});

describe('B3: Keep chat history', function () {
    it('refuses new chats and messages when off; old ones stay readable', function () {
        $conversation = Conversation::factory()->for($this->member)->create();
        $this->member->update(['history_enabled' => false]);
        $token = profileToken($this->member, $this->device);

        $this->withToken($token)->postJson('/api/conversations', ['client_uuid' => (string) Str::uuid(), 'title' => 'Plans'])
            ->assertForbidden()->assertJsonPath('message', 'Chat history is turned off for this profile.');
        $this->withToken($token)->postJson("/api/conversations/{$conversation->id}/messages", [
            'messages' => [[
                'client_uuid' => (string) Str::uuid(),
                'role' => 'user',
                'content' => 'Hello',
                'sent_at' => '2026-10-01T10:00:00Z',
            ]],
        ])->assertForbidden();
        $this->withToken($token)->getJson('/api/conversations')->assertOk()->assertJsonCount(1, 'data');
    });

    it('is changed by the Owner, never by the profile itself', function () {
        $this->withToken(profileToken($this->member, $this->device))
            ->patchJson('/api/me', ['history_enabled' => false])
            ->assertUnprocessable()->assertJsonValidationErrors('history_enabled');
        forgetAuth();

        $this->withToken($this->ownerToken)
            ->patchJson("/api/profiles/{$this->member->id}", ['history_enabled' => false])
            ->assertOk()->assertJsonPath('data.history_enabled', false);
    });
});

describe('B4: Chat with Aster', function () {
    it('unlocks without an llm_token and refuses a new one when off', function () {
        $this->withToken($this->ownerToken)
            ->patchJson("/api/profiles/{$this->member->id}", ['chat_enabled' => false])->assertOk();
        forgetAuth();

        $unlock = $this->withToken($this->deviceToken)
            ->postJson("/api/profiles/{$this->member->id}/unlock", ['pin' => '123456'])
            ->assertOk()
            ->assertJsonPath('llm_token', null)
            ->assertJsonPath('profile.chat_enabled', false);
        forgetAuth();

        expect($unlock->json('expires_at'))->not->toBeNull();
        $this->withToken($unlock->json('profile_token'))->postJson('/api/llm-token')
            ->assertForbidden()->assertJsonPath('message', 'Chat is turned off for this profile.');
    });

    it('ends the profile\'s open sessions when turned off', function () {
        $open = profileToken($this->member, $this->device);

        $this->withToken($this->ownerToken)
            ->patchJson("/api/profiles/{$this->member->id}", ['chat_enabled' => false])->assertOk();
        forgetAuth();

        $this->withToken($open)->getJson('/api/me')->assertUnauthorized();
    });

    it('can\'t be turned off for the Owner, or by a profile on itself', function () {
        $this->withToken($this->ownerToken)
            ->patchJson("/api/profiles/{$this->owner->id}", ['chat_enabled' => false])
            ->assertUnprocessable()->assertJsonValidationErrors('chat_enabled');
        forgetAuth();

        $this->withToken(profileToken($this->member, $this->device))
            ->patchJson('/api/me', ['chat_enabled' => false])
            ->assertUnprocessable()->assertJsonValidationErrors('chat_enabled');
    });
});

describe('B5: Clear log', function () {
    it('clears the profile\'s own events, and the device\'s for the Owner', function () {
        $log = fn (?Profile $profile) => ActivityLog::factory()->for($this->household)->create([
            'profile_id' => $profile?->id,
            'device_id' => $this->device->id,
        ]);
        $log($this->member);
        $log($this->owner);
        $log(null);

        $this->withToken(profileToken($this->member, $this->device))->deleteJson('/api/activity')->assertNoContent();
        expect(ActivityLog::where('profile_id', $this->member->id)->exists())->toBeFalse()
            ->and(ActivityLog::count())->toBe(2);
        forgetAuth();

        $this->withToken($this->ownerToken)->deleteJson('/api/activity')->assertNoContent();
        expect(ActivityLog::count())->toBe(0);
    });

    it('leaves other households alone', function () {
        ActivityLog::factory()->create();

        $this->withToken($this->ownerToken)->deleteJson('/api/activity')->assertNoContent();
        expect(ActivityLog::count())->toBe(1);
    });
});

describe('B6: Delete all of a profile\'s chats', function () {
    it('tombstones every chat of the profile and removes their messages', function () {
        $mine = Conversation::factory()->count(2)->for($this->owner)->create();
        ChatMessage::factory()->for($mine[0])->create();
        $theirs = Conversation::factory()->for($this->member)->create();

        $this->withToken($this->ownerToken)->deleteJson('/api/conversations')->assertNoContent();

        expect(Conversation::where('profile_id', $this->owner->id)->count())->toBe(0)
            ->and(Conversation::onlyTrashed()->where('profile_id', $this->owner->id)->count())->toBe(2)
            ->and(ChatMessage::where('conversation_id', $mine[0]->id)->exists())->toBeFalse()
            ->and($theirs->fresh()->trashed())->toBeFalse();
    });
});
