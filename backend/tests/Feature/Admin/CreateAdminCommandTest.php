<?php

use App\Models\Admin;
use App\Models\AdminAuditLog;
use Illuminate\Support\Facades\Hash;

it('creates an admin with a hidden password and audits it', function () {
    $this->artisan('aster:create-admin', ['email' => 'Ops@Example.com', '--name' => 'Ops'])
        ->expectsQuestion('Password (at least 12 characters)', 'a-long-password')
        ->expectsQuestion('Password again', 'a-long-password')
        ->assertSuccessful();

    $admin = Admin::sole();
    $entry = AdminAuditLog::sole();

    expect($admin->email)->toBe('ops@example.com')
        ->and($admin->name)->toBe('Ops')
        ->and($admin->is_active)->toBeTrue()
        ->and(Hash::check('a-long-password', $admin->password))->toBeTrue()
        ->and($admin->hasMultiFactorSetUp())->toBeFalse()
        ->and($entry->action)->toBe('admin.created')
        ->and($entry->admin_id)->toBe($admin->id)
        ->and($entry->subject_id)->toBe($admin->id)
        ->and($entry->meta)->toBe(['via' => 'console']);
});

it('defaults the name to the part of the email before @', function () {
    $this->artisan('aster:create-admin', ['email' => 'rohan@example.com'])
        ->expectsQuestion('Password (at least 12 characters)', 'a-long-password')
        ->expectsQuestion('Password again', 'a-long-password')
        ->assertSuccessful();

    expect(Admin::sole()->name)->toBe('rohan');
});

it('refuses a duplicate or invalid email', function () {
    Admin::factory()->create(['email' => 'ops@example.com']);

    $this->artisan('aster:create-admin', ['email' => 'ops@example.com'])->assertFailed();
    $this->artisan('aster:create-admin', ['email' => 'not-an-email'])->assertFailed();

    expect(Admin::count())->toBe(1);
});

it('refuses a short or mismatched password', function () {
    $this->artisan('aster:create-admin', ['email' => 'ops@example.com'])
        ->expectsQuestion('Password (at least 12 characters)', 'short')
        ->assertFailed();
    $this->artisan('aster:create-admin', ['email' => 'ops@example.com'])
        ->expectsQuestion('Password (at least 12 characters)', 'a-long-password')
        ->expectsQuestion('Password again', 'a-different-one')
        ->assertFailed();

    expect(Admin::count())->toBe(0)->and(AdminAuditLog::count())->toBe(0);
});

it('refuses to run without a terminal', function () {
    $this->artisan('aster:create-admin', ['email' => 'ops@example.com', '--no-interaction' => true])->assertFailed();

    expect(Admin::count())->toBe(0);
});
