<?php

use App\Enums\ProfileRole;
use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

function ownerFields(array $overrides = []): array
{
    return array_merge([
        'name' => 'Rohan',
        'color' => '#7fd9b8',
        'role' => 'owner',
        'pin' => '123456',
    ], $overrides);
}

beforeEach(function () {
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->deviceToken = deviceToken($this->household, $this->device);
});

describe('create', function () {
    it('creates the Owner and Guest from a device token', function () {
        $response = $this->withToken($this->deviceToken)->postJson('/api/profiles', ownerFields(['auto_lock_minutes' => 2]));

        $owner = Profile::where('role', 'owner')->sole();
        $guest = Profile::where('role', 'guest')->sole();

        $response->assertCreated()
            ->assertJsonPath('data.id', $owner->id)
            ->assertJsonPath('data.name', 'Rohan')
            ->assertJsonPath('data.color', '#7FD9B8')
            ->assertJsonPath('data.role', 'owner')
            ->assertJsonPath('data.has_pin', true)
            ->assertJsonPath('data.web_mode', 'auto')
            ->assertJsonPath('data.memory_enabled', true)
            ->assertJsonPath('data.sampling', 'auto')
            ->assertJsonPath('data.max_tokens', null)
            ->assertJsonPath('data.auto_lock_minutes', 2)
            ->assertJsonStructure(['data' => ['personality', 'created_at', 'updated_at']]);

        expect($response->json('data.created_at'))->toMatch('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/')
            ->and(Hash::check('123456', $owner->pin_hash))->toBeTrue()
            ->and($guest->user_id)->toBe($this->household->id)
            ->and($guest->name)->toBe('Guest')
            ->and($guest->color)->toBe('#9299A1')
            ->and($guest->pin_hash)->toBeNull();
    });

    it('requires the first profile to be the Owner', function () {
        $this->withToken($this->deviceToken)->postJson('/api/profiles', ownerFields(['role' => 'member']))
            ->assertUnprocessable()
            ->assertJsonPath('errors.role.0', 'The first profile must be the Owner.');

        expect(Profile::count())->toBe(0);
    });

    it('refuses a device token once a profile exists', function () {
        Profile::factory()->for($this->household)->owner()->create();

        $this->withToken($this->deviceToken)->postJson('/api/profiles', ownerFields(['role' => 'member']))
            ->assertForbidden()
            ->assertJsonPath('message', 'Only the Owner can add profiles.');
    });

    it('lets the Owner add members, but not a second Owner or a Guest', function () {
        $owner = Profile::factory()->for($this->household)->owner()->create();
        $token = profileToken($owner, $this->device);

        $this->withToken($token)->postJson('/api/profiles', ownerFields(['name' => 'Meera', 'role' => 'member']))
            ->assertCreated()->assertJsonPath('data.role', 'member');
        $this->withToken($token)->postJson('/api/profiles', ownerFields(['name' => 'Arjun', 'role' => 'restricted', 'web_mode' => 'never']))
            ->assertCreated()->assertJsonPath('data.web_mode', 'never');
        $this->withToken($token)->postJson('/api/profiles', ownerFields(['name' => 'Two']))
            ->assertUnprocessable()->assertJsonPath('errors.role.0', 'This household already has an Owner.');
        $this->withToken($token)->postJson('/api/profiles', ownerFields(['role' => 'guest']))
            ->assertUnprocessable()->assertJsonValidationErrors('role');

        expect(Profile::where('role', 'guest')->count())->toBe(0);
    });

    it('refuses a member adding profiles', function () {
        $member = Profile::factory()->for($this->household)->member()->create();

        $this->withToken(profileToken($member, $this->device))->postJson('/api/profiles', ownerFields(['role' => 'member']))
            ->assertForbidden();
    });

    it('refuses a suspended household', function () {
        $this->household->update(['suspended_at' => now()]);

        $this->withToken($this->deviceToken)->postJson('/api/profiles', ownerFields())
            ->assertForbidden()->assertJsonPath('message', 'This account is suspended.');
    });

    it('validates the value rules', function (array $fields, string $error) {
        $this->withToken($this->deviceToken)->postJson('/api/profiles', ownerFields($fields))
            ->assertUnprocessable()->assertJsonValidationErrors($error);
    })->with([
        'pin too short' => [['pin' => '12345'], 'pin'],
        'pin with letters' => [['pin' => '12a456'], 'pin'],
        'pin too long' => [['pin' => '1234567'], 'pin'],
        'colour name' => [['color' => 'red'], 'color'],
        'short hex' => [['color' => '#FFF'], 'color'],
        'long name' => [['name' => str_repeat('a', 41)], 'name'],
        'personality' => [['personality' => str_repeat('a', 2001)], 'personality'],
        'auto lock 0' => [['auto_lock_minutes' => 0], 'auto_lock_minutes'],
        'auto lock 61' => [['auto_lock_minutes' => 61], 'auto_lock_minutes'],
        'max tokens low' => [['max_tokens' => 15], 'max_tokens'],
        'max tokens high' => [['max_tokens' => 8193], 'max_tokens'],
        'web mode' => [['web_mode' => 'always'], 'web_mode'],
        'sampling' => [['sampling' => 'wild'], 'sampling'],
    ]);

    it('accepts a null auto-lock', function () {
        $this->withToken($this->deviceToken)->postJson('/api/profiles', ownerFields(['auto_lock_minutes' => null]))
            ->assertCreated()->assertJsonPath('data.auto_lock_minutes', null);
    });
});

describe('list', function () {
    it('lists the household\'s profiles, Guest included, as summaries', function () {
        $owner = Profile::factory()->for($this->household)->owner()->create();
        $guest = Profile::factory()->for($this->household)->guest()->create();
        Profile::factory()->owner()->create(); // another household

        $this->withToken($this->deviceToken)->getJson('/api/profiles')
            ->assertOk()
            ->assertExactJson(['data' => [
                ['id' => $owner->id, 'name' => $owner->name, 'color' => $owner->color, 'role' => 'owner'],
                ['id' => $guest->id, 'name' => 'Guest', 'color' => '#9299A1', 'role' => 'guest'],
            ]]);
    });

    it('needs a device token', function () {
        $owner = Profile::factory()->for($this->household)->owner()->create();

        $this->withToken(profileToken($owner, $this->device))->getJson('/api/profiles')->assertForbidden();
    });
});

describe('update and delete', function () {
    beforeEach(function () {
        $this->owner = Profile::factory()->for($this->household)->owner()->create();
        $this->member = Profile::factory()->for($this->household)->member()->create();
        $this->guest = Profile::factory()->for($this->household)->guest()->create();
        $this->ownerToken = profileToken($this->owner, $this->device);
    });

    it('lets the Owner edit a profile and reset its PIN', function () {
        $this->withToken($this->ownerToken)->patchJson("/api/profiles/{$this->member->id}", [
            'name' => 'Meera', 'role' => 'restricted', 'pin' => '654321', 'max_tokens' => 512,
        ])->assertOk()
            ->assertJsonPath('data.name', 'Meera')
            ->assertJsonPath('data.role', 'restricted')
            ->assertJsonPath('data.max_tokens', 512);

        expect(Hash::check('654321', $this->member->fresh()->pin_hash))->toBeTrue();
    });

    it('never changes the Owner\'s or Guest\'s role', function () {
        $this->withToken($this->ownerToken)->patchJson("/api/profiles/{$this->owner->id}", ['role' => 'member'])
            ->assertUnprocessable()->assertJsonPath('errors.role.0', 'The Owner\'s role can\'t change.');
        $this->withToken($this->ownerToken)->patchJson("/api/profiles/{$this->guest->id}", ['role' => 'member'])
            ->assertUnprocessable()->assertJsonPath('errors.role.0', 'Guest\'s role can\'t change.');
        $this->withToken($this->ownerToken)->patchJson("/api/profiles/{$this->member->id}", ['role' => 'owner'])
            ->assertUnprocessable()->assertJsonPath('errors.role.0', 'A role can only change between member and restricted.');

        expect($this->owner->fresh()->role)->toBe(ProfileRole::Owner)
            ->and($this->guest->fresh()->role)->toBe(ProfileRole::Guest)
            ->and($this->member->fresh()->role)->toBe(ProfileRole::Member);
    });

    it('gives Guest no PIN', function () {
        $this->withToken($this->ownerToken)->patchJson("/api/profiles/{$this->guest->id}", ['pin' => '111111'])
            ->assertUnprocessable()->assertJsonPath('errors.pin.0', 'Guest has no PIN.');
    });

    it('refuses a member editing profiles', function () {
        $this->withToken(profileToken($this->member, $this->device))
            ->patchJson("/api/profiles/{$this->member->id}", ['name' => 'X'])
            ->assertForbidden();
    });

    it('soft-deletes a profile and revokes its tokens', function () {
        $memberToken = profileToken($this->member, $this->device);

        $this->withToken($this->ownerToken)->deleteJson("/api/profiles/{$this->member->id}")->assertNoContent();

        expect($this->member->fresh()->trashed())->toBeTrue()
            ->and(PersonalAccessToken::findToken($memberToken))->toBeNull()
            ->and(PersonalAccessToken::findToken($this->ownerToken))->not->toBeNull();
    });

    it('refuses to delete the Owner or Guest', function () {
        $this->withToken($this->ownerToken)->deleteJson("/api/profiles/{$this->owner->id}")->assertUnprocessable();
        $this->withToken($this->ownerToken)->deleteJson("/api/profiles/{$this->guest->id}")->assertUnprocessable();

        expect(Profile::count())->toBe(3);
    });

    it('answers 404 for another household\'s profile', function () {
        $other = Profile::factory()->member()->create();

        $this->withToken($this->ownerToken)->patchJson("/api/profiles/{$other->id}", ['name' => 'X'])->assertNotFound();
        $this->withToken($this->ownerToken)->deleteJson("/api/profiles/{$other->id}")->assertNotFound();
        $this->withToken($this->ownerToken)->deleteJson('/api/profiles/abc')->assertNotFound();

        expect($other->fresh()->name)->not->toBe('X');
    });
});
