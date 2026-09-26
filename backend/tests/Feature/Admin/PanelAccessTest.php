<?php

use App\Models\Admin;
use App\Models\Profile;
use App\Models\User;
use Filament\Auth\Pages\Login;
use Filament\Facades\Filament;
use Illuminate\Support\Facades\Route;
use Livewire\Livewire;
use PragmaRX\Google2FA\Google2FA;

beforeEach(fn () => Filament::setCurrentPanel('admin'));

it('sends a visitor to the admin sign-in page', function () {
    $this->get('/admin')->assertRedirect('/admin/login');
    $this->get('/admin/login')->assertOk()->assertSee('Aster Admin');
});

it('has no sign-up or password reset pages', function () {
    expect(Route::has('filament.admin.auth.register'))->toBeFalse()
        ->and(Route::has('filament.admin.auth.password-reset.request'))->toBeFalse();
    $this->get('/admin/register')->assertNotFound();
    $this->get('/admin/password-reset/request')->assertNotFound();
});

it('keeps household accounts out', function () {
    $household = User::factory()->create(['email' => 'rohan@example.com', 'password' => 'password']);

    // A household session on the web guard is not an admin session.
    $this->actingAs($household, 'web')->get('/admin')->assertRedirect('/admin/login');

    // Household credentials don't work on the admin sign-in form.
    Livewire::test(Login::class)
        ->fillForm(['email' => 'rohan@example.com', 'password' => 'password'])
        ->call('authenticate')
        ->assertHasFormErrors(['email']);

    expect(auth('admin')->check())->toBeFalse();
});

it('keeps profile and device tokens out', function () {
    $owner = Profile::factory()->owner()->create();

    $this->withToken(profileToken($owner))->get('/admin')->assertRedirect('/admin/login');
    $this->withToken(deviceToken($owner->user))->get('/admin')->assertRedirect('/admin/login');
});

it('refuses an inactive admin', function () {
    $admin = Admin::factory()->withMfa()->inactive()->create(['password' => 'password']);

    Livewire::test(Login::class)
        ->fillForm(['email' => $admin->email, 'password' => 'password'])
        ->call('authenticate')
        ->assertHasFormErrors(['email']);
    expect(auth('admin')->check())->toBeFalse();

    // An admin deactivated mid-session is locked out on the next request.
    $this->actingAs($admin, 'admin')->get('/admin')->assertForbidden();
});

it('sends an admin without MFA to set it up before the dashboard', function () {
    $admin = Admin::factory()->create();

    $this->actingAs($admin, 'admin')->get('/admin')
        ->assertRedirect(route('filament.admin.auth.multi-factor-authentication.set-up-required'));
    $this->actingAs($admin, 'admin')->get('/admin/audit-log')
        ->assertRedirect(route('filament.admin.auth.multi-factor-authentication.set-up-required'));
});

it('shows a QR code the browser can render when setting up MFA', function () {
    $this->actingAs(Admin::factory()->create(), 'admin');

    $uri = Filament::getCurrentPanel()->getMultiFactorAuthenticationProviders()['app']
        ->generateQrCodeDataUri('JBSWY3DPEHPK3PXP');

    // One data URI wrapping the SVG itself, not a data URI wrapping another.
    expect($uri)->toStartWith('data:image/svg+xml;base64,')
        ->and(base64_decode(substr($uri, strlen('data:image/svg+xml;base64,'))))
        ->toStartWith('<?xml')
        ->toContain('<svg');
});

it('shows the dashboard to an active admin with MFA', function () {
    $admin = Admin::factory()->withMfa()->create();

    $this->actingAs($admin, 'admin')->get('/admin')->assertOk()->assertSee('Dashboard');
});

it('signs in with a password and an authenticator code, and records last_login_at', function () {
    $this->travelTo('2026-09-24 10:00:00');
    $admin = Admin::factory()->withMfa()->create(['password' => 'password']);

    $login = Livewire::test(Login::class)
        ->fillForm(['email' => $admin->email, 'password' => 'password'])
        ->call('authenticate');

    // The password alone isn't enough: the code is asked for next.
    expect(auth('admin')->check())->toBeFalse()
        ->and($login->get('userUndertakingMultiFactorAuthentication'))->not->toBeNull();

    $code = (new Google2FA)->getCurrentOtp($admin->getAppAuthenticationSecret());
    $login->set('data.multiFactor.app.code', $code)->call('authenticate')->assertHasNoErrors();

    expect(auth('admin')->id())->toBe($admin->id)
        ->and($admin->fresh()->last_login_at->toDateTimeString())->toBe('2026-09-24 10:00:00');
});

it('rejects a wrong authenticator code', function () {
    $admin = Admin::factory()->withMfa()->create(['password' => 'password']);

    Livewire::test(Login::class)
        ->fillForm(['email' => $admin->email, 'password' => 'password'])
        ->call('authenticate')
        ->set('data.multiFactor.app.code', '000000')
        ->call('authenticate');

    expect(auth('admin')->check())->toBeFalse();
});

describe('IP allowlist', function () {
    it('allows everyone when ASTER_ADMIN_ALLOWED_IPS is empty', function () {
        config(['aster.admin.allowed_ips' => []]);

        $this->get('/admin/login')->assertOk();
    });

    it('refuses addresses outside the list, with CIDR ranges', function () {
        config(['aster.admin.allowed_ips' => ['203.0.113.0/24']]);

        $this->get('/admin/login')->assertForbidden();
        $this->get('/admin/login', ['REMOTE_ADDR' => '203.0.113.4'])->assertOk();
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.4'])->get('/admin/login')->assertOk();
    });

    it('leaves the API alone', function () {
        config(['aster.admin.allowed_ips' => ['203.0.113.0/24']]);

        $this->get('/up')->assertOk();
        $this->postJson('/api/auth/login', [])->assertUnprocessable();
    });
});

it('never shows password hashes or MFA secrets', function () {
    $admin = Admin::factory()->withMfa()->create();
    $other = Admin::factory()->withMfa()->create();

    $html = $this->actingAs($admin, 'admin')->get('/admin/admins')->assertOk()->getContent();

    expect($html)->not->toContain($other->getAppAuthenticationSecret())
        ->not->toContain($other->password)
        ->and($admin->toArray())->not->toHaveKeys(['password', 'app_authentication_secret', 'app_authentication_recovery_codes']);
});
