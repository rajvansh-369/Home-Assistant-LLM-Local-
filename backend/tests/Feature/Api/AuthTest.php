<?php

use App\Enums\AuthEventType;
use App\Models\AuthEvent;
use App\Models\Device;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;

function registration(array $overrides = []): array
{
    return array_merge([
        'name' => 'Rohan',
        'email' => 'rohan@example.com',
        'password' => 'secret-pass',
        'device_name' => 'Pixel 8',
        'app_version' => '1.0.0',
    ], $overrides);
}

function credentials(array $overrides = []): array
{
    return array_merge([
        'email' => 'rohan@example.com',
        'password' => 'secret-pass',
        'device_name' => 'Galaxy S24',
    ], $overrides);
}

describe('register', function () {
    it('creates a household, a device and a device token', function () {
        $response = $this->postJson('/api/auth/register', registration());

        $household = User::sole();
        $device = Device::sole();

        $response->assertCreated()
            ->assertExactJson([
                'token' => $response->json('token'),
                'household_id' => 'h'.$household->id,
                'user' => ['id' => $household->id, 'name' => 'Rohan', 'email' => 'rohan@example.com'],
                'device' => ['id' => $device->id, 'name' => 'Pixel 8'],
            ]);

        $token = PersonalAccessToken::findToken($response->json('token'));
        expect($token->tokenable->is($household))->toBeTrue()
            ->and($token->name)->toBe('device:'.$device->id)
            ->and($token->abilities)->toBe(['device'])
            ->and($token->expires_at)->toBeNull()
            ->and($device->app_version)->toBe('1.0.0')
            ->and($household->locationSettings)->not->toBeNull()
            ->and($household->alertSettings)->not->toBeNull();
    });

    it('lowercases the email', function () {
        $this->postJson('/api/auth/register', registration(['email' => ' Rohan@Example.COM ']))->assertCreated();

        expect(User::sole()->email)->toBe('rohan@example.com');
    });

    it('stays open for more households in open mode', function () {
        config(['aster.registration' => 'open']);

        $this->postJson('/api/auth/register', registration())->assertCreated();
        $this->postJson('/api/auth/register', registration(['email' => 'meera@example.com']))->assertCreated();

        expect(User::count())->toBe(2);
    });

    it('closes once a household exists in single mode', function () {
        config(['aster.registration' => 'single']);

        $this->postJson('/api/auth/register', registration())->assertCreated();
        $this->postJson('/api/auth/register', registration(['email' => 'meera@example.com']))
            ->assertForbidden()
            ->assertExactJson(['message' => 'Registration is closed.']);

        expect(User::count())->toBe(1);
    });

    it('refuses a duplicate email', function () {
        User::factory()->create(['email' => 'rohan@example.com']);

        $this->postJson('/api/auth/register', registration(['email' => 'ROHAN@example.com']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    });

    it('validates the request', function () {
        $this->postJson('/api/auth/register', ['password' => 'short'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'email', 'password', 'device_name']);
    });
});

describe('login', function () {
    beforeEach(function () {
        $this->household = User::factory()->create(['email' => 'rohan@example.com', 'password' => 'secret-pass']);
    });

    it('signs a new device in', function () {
        $response = $this->postJson('/api/auth/login', credentials(['app_version' => '1.1.0']));

        $device = Device::sole();

        $response->assertOk()
            ->assertExactJson([
                'token' => $response->json('token'),
                'household_id' => 'h'.$this->household->id,
                'user' => ['id' => $this->household->id, 'name' => $this->household->name, 'email' => 'rohan@example.com'],
                'device' => ['id' => $device->id, 'name' => 'Galaxy S24'],
            ]);

        expect(PersonalAccessToken::findToken($response->json('token'))->name)->toBe('device:'.$device->id)
            ->and($device->app_version)->toBe('1.1.0');
    });

    it('refuses a wrong password', function () {
        $this->postJson('/api/auth/login', credentials(['password' => 'wrong-pass']))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Email or password is wrong.')
            ->assertJsonPath('errors.email.0', 'Email or password is wrong.');

        expect(Device::count())->toBe(0)
            ->and(PersonalAccessToken::count())->toBe(0);
    });

    it('gives an unknown email the same answer as a wrong password', function () {
        $this->postJson('/api/auth/login', credentials(['email' => 'nobody@example.com']))
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Email or password is wrong.');
    });

    it('refuses a suspended household', function () {
        $this->household->update(['suspended_at' => now(), 'suspension_reason' => 'Abuse']);

        $this->postJson('/api/auth/login', credentials())
            ->assertForbidden()
            ->assertExactJson(['message' => 'This account is suspended.']);

        expect(PersonalAccessToken::count())->toBe(0);
    });

    it('limits tries to 10 a minute per IP and email', function () {
        foreach (range(1, 10) as $ignored) {
            $this->postJson('/api/auth/login', credentials(['password' => 'wrong-pass']))->assertUnprocessable();
        }

        $response = $this->postJson('/api/auth/login', credentials());

        $response->assertTooManyRequests()
            ->assertHeader('Retry-After')
            ->assertJsonStructure(['message', 'retry_after']);
        expect($response->json('retry_after'))->toBeInt()->toBeGreaterThan(0)->toBeLessThanOrEqual(60);

        $this->postJson('/api/auth/login', credentials(['email' => 'other@example.com']))->assertUnprocessable();
    });
});

describe('logout', function () {
    it('revokes only that device\'s token', function () {
        $household = User::factory()->create();
        $phone = Device::factory()->for($household)->create();
        $tablet = Device::factory()->for($household)->create();
        $phoneToken = deviceToken($household, $phone);
        $tabletToken = deviceToken($household, $tablet);

        $this->withToken($phoneToken)->postJson('/api/auth/logout')->assertNoContent();

        expect($phone->fresh()->signed_out_at)->not->toBeNull()
            ->and($tablet->fresh()->signed_out_at)->toBeNull()
            ->and(PersonalAccessToken::findToken($phoneToken))->toBeNull()
            ->and(PersonalAccessToken::findToken($tabletToken))->not->toBeNull();

        forgetAuth();
        $this->withToken($phoneToken)->postJson('/api/auth/logout')->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
        forgetAuth();
        $this->withToken($tabletToken)->postJson('/api/auth/logout')->assertNoContent();
    });

    it('needs a token', function () {
        $this->postJson('/api/auth/logout')->assertUnauthorized();
        $this->post('/api/auth/logout')->assertUnauthorized()->assertJson(['message' => 'Unauthenticated.']);
    });
});

describe('auth events', function () {
    it('records register, login, login_failed and logout with the IP address', function () {
        $register = $this->postJson('/api/auth/register', registration(), ['REMOTE_ADDR' => '203.0.113.4']);
        $this->postJson('/api/auth/login', credentials(['password' => 'wrong-pass']));
        $this->postJson('/api/auth/login', credentials(['email' => 'nobody@example.com']));
        $this->postJson('/api/auth/login', credentials());
        forgetAuth();
        $this->withToken($register->json('token'))->postJson('/api/auth/logout');

        $household = User::sole();
        $events = AuthEvent::orderBy('id')->get();

        expect($events->pluck('type')->all())->toBe([
            AuthEventType::Register, AuthEventType::LoginFailed, AuthEventType::LoginFailed, AuthEventType::Login, AuthEventType::Logout,
        ])
            ->and($events->pluck('user_id')->all())->toBe([$household->id, $household->id, null, $household->id, $household->id])
            ->and($events[0]->ip)->toBe('203.0.113.4')
            ->and($events->every(fn ($e) => $e->ip !== null))->toBeTrue()
            ->and($events[0]->device_id)->toBe(Device::orderBy('id')->first()->id);
    });
});

it('never returns a password, password hash or token hash', function () {
    $register = $this->postJson('/api/auth/register', registration());
    $login = $this->postJson('/api/auth/login', credentials());

    $hashes = DB::table('personal_access_tokens')->pluck('token')
        ->push(User::sole()->password);

    foreach ([$register, $login] as $response) {
        $body = $response->getContent();
        expect($body)->not->toContain('secret-pass')
            ->and($body)->not->toContain('"password"');
        foreach ($hashes as $hash) {
            expect($body)->not->toContain($hash);
        }
    }
});
