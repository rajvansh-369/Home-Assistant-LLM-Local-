<?php

use App\Enums\AuthEventType;
use App\Models\AuthEvent;
use App\Models\Device;
use App\Models\Profile;
use App\Models\User;

beforeEach(function () {
    $this->travelTo('2026-09-24 10:00:00');
    $household = User::factory()->create();
    $device = Device::factory()->for($household)->create();
    $this->token = deviceToken($household, $device);
    $this->profile = Profile::factory()->for($household)->owner()->create();
    $this->unlock = fn (string $pin) => $this->withToken($this->token)
        ->postJson("/api/profiles/{$this->profile->id}/unlock", ['pin' => $pin]);
});

function wrongPins(Closure $unlock, int $times): void
{
    for ($i = 0; $i < $times; $i++) {
        $unlock('000000');
    }
}

it('counts wrong PINs down, then locks for 30 s', function () {
    foreach ([4, 3, 2, 1] as $left) {
        ($this->unlock)('000000')
            ->assertUnprocessable()
            ->assertExactJson(['message' => 'Wrong PIN.', 'errors' => ['pin' => ['Wrong PIN.']], 'attempts_left' => $left]);
    }

    ($this->unlock)('000000')
        ->assertTooManyRequests()
        ->assertHeader('Retry-After', '30')
        ->assertExactJson(['message' => 'Too many wrong PINs. Try again in 30 s.', 'retry_after' => 30]);
});

it('does not check the PIN during a lockout', function () {
    wrongPins($this->unlock, 5);

    $this->travel(10)->seconds();
    ($this->unlock)('123456')->assertTooManyRequests()->assertJsonPath('retry_after', 20);

    $this->travel(21)->seconds();
    ($this->unlock)('123456')->assertOk();
});

it('gives 5 fresh tries after a lockout, and doubles the next lockout', function () {
    wrongPins($this->unlock, 5);
    $this->travel(31)->seconds();

    foreach ([4, 3, 2, 1] as $left) {
        ($this->unlock)('000000')->assertJsonPath('attempts_left', $left);
    }
    ($this->unlock)('000000')->assertTooManyRequests()->assertJsonPath('retry_after', 60);
});

it('doubles lockouts up to one hour', function () {
    $seen = [];
    foreach (range(1, 9) as $ignored) {
        wrongPins($this->unlock, 4);
        $response = ($this->unlock)('000000')->assertTooManyRequests();
        $seen[] = $response->json('retry_after');
        $this->travel($response->json('retry_after') + 1)->seconds();
    }

    expect($seen)->toBe([30, 60, 120, 240, 480, 960, 1920, 3600, 3600]);
});

it('starts again at 30 s once the lockouts are a day old', function () {
    wrongPins($this->unlock, 5);
    $this->travel(31)->seconds();
    wrongPins($this->unlock, 4);
    ($this->unlock)('000000')->assertJsonPath('retry_after', 60);

    $this->travel(25)->hours();
    wrongPins($this->unlock, 4);
    ($this->unlock)('000000')->assertJsonPath('retry_after', 30);
});

it('clears the tries on a right PIN but keeps the lockout history', function () {
    wrongPins($this->unlock, 2);
    ($this->unlock)('123456')->assertOk();
    ($this->unlock)('000000')->assertJsonPath('attempts_left', 4);

    wrongPins($this->unlock, 4); // the 5th wrong try in a row locks
    $this->travel(31)->seconds();
    ($this->unlock)('123456')->assertOk();
    wrongPins($this->unlock, 4);
    ($this->unlock)('000000')->assertJsonPath('retry_after', 60);
});

it('keeps separate counts per profile', function () {
    $member = Profile::factory()->for($this->profile->user)->member()->create();
    wrongPins($this->unlock, 5);

    $this->withToken($this->token)->postJson("/api/profiles/{$member->id}/unlock", ['pin' => '123456'])->assertOk();
});

it('writes unlock, unlock_failed and lockout auth events', function () {
    wrongPins($this->unlock, 5);
    $this->travel(31)->seconds();
    ($this->unlock)('123456');

    $types = AuthEvent::orderBy('id')->pluck('type')->all();

    expect($types)->toBe([
        ...array_fill(0, 5, AuthEventType::UnlockFailed),
        AuthEventType::Lockout,
        AuthEventType::Unlock,
    ])->and(AuthEvent::whereNull('profile_id')->count())->toBe(0);
});
