<?php

use App\Models\Device;
use App\Models\Profile;
use App\Models\User;

beforeEach(function () {
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->owner = Profile::factory()->for($this->household)->owner()->create();
});

describe('request size', function () {
    it('answers 413 to a body over 1 MB', function () {
        $points = array_fill(0, 500, ['client_uuid' => str_repeat('x', 2100)]);

        $this->withToken(deviceToken($this->household, $this->device))
            ->postJson('/api/locations/batch', ['points' => $points])
            ->assertStatus(413)
            ->assertExactJson(['message' => 'The request is too large.']);
    });

    it('lets a body under the limit through', function () {
        $points = array_fill(0, 500, ['client_uuid' => str_repeat('x', 1900)]);

        $this->withToken(deviceToken($this->household, $this->device))
            ->postJson('/api/locations/batch', ['points' => $points])
            ->assertUnprocessable();
    });

    it('follows ASTER_MAX_REQUEST_KB', function () {
        config(['aster.max_request_kb' => 1]);

        $this->postJson('/api/auth/login', ['email' => str_repeat('a', 1100)])->assertStatus(413);
    });
});

describe('rate limits', function () {
    it('allows 120 requests a minute per token', function () {
        $token = profileToken($this->owner, $this->device);

        for ($i = 0; $i < 120; $i++) {
            $this->withToken($token)->getJson('/api/me')->assertOk();
        }

        $this->withToken($token)->getJson('/api/me')
            ->assertTooManyRequests()
            ->assertHeader('Retry-After')
            ->assertJsonStructure(['message', 'retry_after']);

        forgetAuth();
        $this->withToken(profileToken($this->owner, Device::factory()->for($this->household)->create()))
            ->getJson('/api/me')->assertOk();

        $this->travel(61)->seconds();
        forgetAuth();
        $this->withToken($token)->getJson('/api/me')->assertOk();
    });

    it('allows 30 batches a minute per device', function () {
        $token = deviceToken($this->household, $this->device);

        for ($i = 0; $i < 30; $i++) {
            $this->withToken($token)->postJson('/api/activity/batch', ['events' => []])->assertUnprocessable();
        }

        $this->withToken($token)->postJson('/api/locations/batch', ['points' => []])
            ->assertTooManyRequests()->assertJsonStructure(['message', 'retry_after']);

        // Another token on the same device shares the limit; another device doesn't.
        $this->withToken(deviceToken($this->household, $this->device))->postJson('/api/activity/batch', ['events' => []])
            ->assertTooManyRequests();
        forgetAuth();
        $this->withToken(deviceToken($this->household, Device::factory()->for($this->household)->create()))
            ->postJson('/api/activity/batch', ['events' => []])->assertUnprocessable();
    });

    it('allows 10 auth tries a minute per IP and email', function () {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'a@example.com', 'password' => 'x', 'device_name' => 'p']);
        }

        $this->postJson('/api/auth/login', ['email' => 'a@example.com', 'password' => 'x', 'device_name' => 'p'])->assertTooManyRequests();
        $this->postJson('/api/auth/login', ['email' => 'a@example.com'], ['REMOTE_ADDR' => '198.51.100.7'])->assertUnprocessable();
    });
});
