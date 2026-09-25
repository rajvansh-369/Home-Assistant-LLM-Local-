<?php

use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Support\Facades\Route;

// Test-only routes, one per middleware, behind the same stack as routes/api.php.
beforeEach(function () {
    Route::middleware(['auth:sanctum', 'device'])->get('api/_test/device', fn () => ['ok' => true]);
    Route::middleware(['auth:sanctum', 'profile'])->get('api/_test/profile', fn () => ['ok' => true]);
    Route::middleware(['auth:sanctum', 'profile', 'not-guest'])->get('api/_test/not-guest', fn () => ['ok' => true]);
    Route::middleware(['auth:sanctum', 'profile', 'not-guest', 'owner'])->get('api/_test/owner', fn () => ['ok' => true]);

    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
});

it('lets each token type through its own route', function () {
    $owner = Profile::factory()->for($this->household)->owner()->create();

    $this->withToken(deviceToken($this->household, $this->device))->getJson('api/_test/device')->assertOk();
    forgetAuth();
    $ownerToken = profileToken($owner, $this->device);
    foreach (['profile', 'not-guest', 'owner'] as $route) {
        $this->withToken($ownerToken)->getJson("api/_test/{$route}")->assertOk();
    }
});

it('refuses a profile token on a device route', function () {
    $profile = Profile::factory()->for($this->household)->owner()->create();

    $this->withToken(profileToken($profile, $this->device))->getJson('api/_test/device')
        ->assertForbidden()
        ->assertExactJson(['message' => 'This needs a device token.']);
});

it('refuses a device token on a profile route', function () {
    $this->withToken(deviceToken($this->household, $this->device))->getJson('api/_test/profile')
        ->assertForbidden()
        ->assertExactJson(['message' => 'This needs an unlocked profile.']);
});

it('refuses a token without the matching ability', function () {
    $token = $this->household->createToken('device:'.$this->device->id, ['profile'])->plainTextToken;

    $this->withToken($token)->getJson('api/_test/device')->assertForbidden();
});

it('refuses a member on an Owner route', function () {
    $member = Profile::factory()->for($this->household)->member()->create();

    $this->withToken(profileToken($member, $this->device))->getJson('api/_test/owner')
        ->assertForbidden()
        ->assertExactJson(['message' => 'Only the Owner can do this.']);
});

it('refuses Guest on a not-guest route but lets it through profile', function () {
    $guest = Profile::factory()->for($this->household)->guest()->create();
    $token = profileToken($guest, $this->device);

    $this->withToken($token)->getJson('api/_test/profile')->assertOk();
    $this->withToken($token)->getJson('api/_test/not-guest')
        ->assertForbidden()
        ->assertExactJson(['message' => 'Guest can\'t do this.']);
});

it('refuses a suspended household with either token type', function () {
    $owner = Profile::factory()->for($this->household)->owner()->create();
    $deviceToken = deviceToken($this->household, $this->device);
    $profileToken = profileToken($owner, $this->device);
    $this->household->update(['suspended_at' => now()]);

    $this->withToken($deviceToken)->getJson('api/_test/device')
        ->assertForbidden()->assertExactJson(['message' => 'This account is suspended.']);
    forgetAuth();
    $this->withToken($profileToken)->getJson('api/_test/profile')
        ->assertForbidden()->assertExactJson(['message' => 'This account is suspended.']);
});

it('refuses a deleted profile and an expired profile token', function () {
    $member = Profile::factory()->for($this->household)->member()->create();
    $token = profileToken($member, $this->device);
    $expired = $member->createToken('device:'.$this->device->id, ['profile'], now()->subMinute())->plainTextToken;
    $member->delete();

    $this->withToken($token)->getJson('api/_test/profile')->assertUnauthorized();
    forgetAuth();
    $member->restore();
    $this->withToken($expired)->getJson('api/_test/profile')->assertUnauthorized();
});

it('refuses a token whose device belongs to another household', function () {
    $otherDevice = Device::factory()->create();
    $token = $this->household->createToken('device:'.$otherDevice->id, ['device'])->plainTextToken;

    $this->withToken($token)->getJson('api/_test/device')->assertUnauthorized();
});

it('answers 401 without a token', function () {
    $this->getJson('api/_test/device')->assertUnauthorized()->assertExactJson(['message' => 'Unauthenticated.']);
});
