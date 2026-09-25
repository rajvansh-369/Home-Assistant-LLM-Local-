<?php

use App\Enums\AuthEventType;
use App\Models\AuthEvent;
use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use Laravel\Sanctum\PersonalAccessToken;

beforeEach(function () {
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->deviceToken = deviceToken($this->household, $this->device);
    $this->owner = Profile::factory()->for($this->household)->owner()->create(['name' => 'Rohan']);
    $this->guest = Profile::factory()->for($this->household)->guest()->create();
});

describe('unlock', function () {
    it('returns a profile token, an llm_token and the profile', function () {
        $this->travelTo('2026-09-24 10:15:00');

        $response = $this->withToken($this->deviceToken)->postJson("/api/profiles/{$this->owner->id}/unlock", ['pin' => '123456']);

        $response->assertOk()
            ->assertJsonPath('expires_at', '2026-09-24T22:15:00Z')
            ->assertJsonPath('household_id', 'h'.$this->household->id)
            ->assertJsonPath('profile.id', $this->owner->id)
            ->assertJsonPath('profile.role', 'owner')
            ->assertJsonPath('profile.has_pin', true)
            ->assertJsonStructure(['profile_token', 'llm_token', 'expires_at', 'household_id', 'profile']);

        $token = PersonalAccessToken::findToken($response->json('profile_token'));
        expect($token->tokenable->is($this->owner))->toBeTrue()
            ->and($token->name)->toBe('device:'.$this->device->id)
            ->and($token->abilities)->toBe(['profile'])
            ->and($token->expires_at->toDateTimeString())->toBe('2026-09-24 22:15:00')
            ->and(llmClaims($response->json('llm_token'))['exp'])->toBe($token->expires_at->getTimestamp())
            ->and($this->owner->fresh()->last_unlocked_at->toDateTimeString())->toBe('2026-09-24 10:15:00')
            ->and(AuthEvent::where('type', AuthEventType::Unlock)->sole()->profile_id)->toBe($this->owner->id);
    });

    it('keeps one session per profile per device', function () {
        $first = $this->withToken($this->deviceToken)->postJson("/api/profiles/{$this->owner->id}/unlock", ['pin' => '123456']);
        $second = $this->withToken($this->deviceToken)->postJson("/api/profiles/{$this->owner->id}/unlock", ['pin' => '123456']);

        expect(PersonalAccessToken::findToken($first->json('profile_token')))->toBeNull()
            ->and(PersonalAccessToken::findToken($second->json('profile_token')))->not->toBeNull();
    });

    it('refuses the Guest profile', function () {
        $this->withToken($this->deviceToken)->postJson("/api/profiles/{$this->guest->id}/unlock", ['pin' => '123456'])
            ->assertUnprocessable()->assertJsonValidationErrors('pin');
    });

    it('answers 404 for another household\'s profile', function () {
        $other = Profile::factory()->owner()->create();

        $this->withToken($this->deviceToken)->postJson("/api/profiles/{$other->id}/unlock", ['pin' => '123456'])
            ->assertNotFound();
    });

    it('needs a device token', function () {
        $this->withToken(profileToken($this->owner, $this->device))
            ->postJson("/api/profiles/{$this->owner->id}/unlock", ['pin' => '123456'])
            ->assertForbidden();
    });
});

describe('guest sessions', function () {
    it('opens the Guest profile without a PIN', function () {
        $response = $this->withToken($this->deviceToken)->postJson('/api/guest-sessions');

        $response->assertOk()->assertJsonPath('profile.id', $this->guest->id)->assertJsonPath('profile.has_pin', false);

        $claims = llmClaims($response->json('llm_token'));
        expect($claims['web'])->toBe('never')
            ->and($claims['memory'])->toBeFalse()
            ->and(AuthEvent::where('type', AuthEventType::GuestSession)->sole()->profile_id)->toBe($this->guest->id);
    });

    it('lets Guest reach only lock and llm-token', function () {
        $token = $this->withToken($this->deviceToken)->postJson('/api/guest-sessions')->json('profile_token');
        forgetAuth();

        $this->withToken($token)->postJson('/api/llm-token')->assertOk();
        $this->withToken($token)->getJson('/api/me')->assertForbidden();
        $this->withToken($token)->patchJson('/api/me', ['name' => 'X'])->assertForbidden();
        $this->withToken($token)->postJson('/api/profiles', ['name' => 'X'])->assertForbidden();
        $this->withToken($token)->getJson('/api/profiles')->assertForbidden();
        $this->withToken($token)->postJson("/api/profiles/{$this->guest->id}/lock")->assertNoContent();
    });
});

describe('lock', function () {
    it('revokes only that profile token', function () {
        $tablet = Device::factory()->for($this->household)->create();
        $phoneToken = profileToken($this->owner, $this->device);
        $tabletToken = profileToken($this->owner, $tablet);

        $this->withToken($phoneToken)->postJson("/api/profiles/{$this->owner->id}/lock")->assertNoContent();

        expect(PersonalAccessToken::findToken($phoneToken))->toBeNull()
            ->and(PersonalAccessToken::findToken($tabletToken))->not->toBeNull()
            ->and(PersonalAccessToken::findToken($this->deviceToken))->not->toBeNull();

        forgetAuth();
        $this->withToken($phoneToken)->postJson('/api/llm-token')->assertUnauthorized();
        forgetAuth();
        $this->withToken($tabletToken)->postJson('/api/llm-token')->assertOk();
    });

    it('refuses another profile\'s id', function () {
        $member = Profile::factory()->for($this->household)->member()->create();

        $this->withToken(profileToken($member, $this->device))->postJson("/api/profiles/{$this->owner->id}/lock")
            ->assertForbidden();
    });
});

describe('llm-token', function () {
    it('never outlives the profile token', function () {
        $this->travelTo('2026-09-24 10:00:00');
        $token = $this->owner->createToken('device:'.$this->device->id, ['profile'], now()->addHour())->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/llm-token');

        $response->assertOk()->assertExactJson([
            'llm_token' => $response->json('llm_token'),
            'expires_at' => '2026-09-24T11:00:00Z',
        ]);
        expect(llmClaims($response->json('llm_token'))['exp'])->toBe(now()->addHour()->getTimestamp());
    });

    it('lasts 12 hours when the profile token lasts longer', function () {
        $this->travelTo('2026-09-24 10:00:00');
        $token = $this->owner->createToken('device:'.$this->device->id, ['profile'])->plainTextToken;

        $this->withToken($token)->postJson('/api/llm-token')->assertJsonPath('expires_at', '2026-09-24T22:00:00Z');
    });
});

it('never returns a PIN hash', function () {
    $hash = $this->owner->pin_hash;
    $unlock = $this->withToken($this->deviceToken)->postJson("/api/profiles/{$this->owner->id}/unlock", ['pin' => '123456']);
    $list = $this->withToken($this->deviceToken)->getJson('/api/profiles');
    forgetAuth();
    $me = $this->withToken($unlock->json('profile_token'))->getJson('/api/me');

    foreach ([$unlock, $list, $me] as $response) {
        expect($response->getContent())->not->toContain('pin_hash')->not->toContain($hash)->not->toContain('123456');
    }
});
