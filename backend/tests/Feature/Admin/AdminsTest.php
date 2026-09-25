<?php

use App\Filament\Resources\Admins\Pages\ListAdmins;
use App\Models\Admin;
use App\Models\AdminAuditLog;
use Filament\Facades\Filament;
use Livewire\Livewire;

beforeEach(function () {
    Filament::setCurrentPanel('admin');
    $this->me = Admin::factory()->withMfa()->create(['name' => 'Me']);
    $this->other = Admin::factory()->withMfa()->create(['name' => 'Other']);
    $this->actingAs($this->me, 'admin');
});

it('lists admins', function () {
    Livewire::test(ListAdmins::class)->assertCanSeeTableRecords([$this->me, $this->other]);
});

it('deactivates another admin and audits it', function () {
    Livewire::test(ListAdmins::class)->callTableAction('deactivate', $this->other);

    expect($this->other->fresh()->is_active)->toBeFalse()
        ->and(AdminAuditLog::where('action', 'admin.deactivated')->sole()->only(['admin_id', 'subject_id']))
        ->toBe(['admin_id' => $this->me->id, 'subject_id' => $this->other->id]);

    // The deactivated admin is locked out at once.
    $this->actingAs($this->other->fresh(), 'admin')->get('/admin')->assertForbidden();
});

it('won\'t let an admin deactivate themselves', function () {
    Livewire::test(ListAdmins::class)
        ->assertTableActionHidden('deactivate', $this->me)
        ->assertTableActionVisible('deactivate', $this->other);

    expect($this->me->fresh()->is_active)->toBeTrue();
});

it('reactivates an admin and audits it', function () {
    $this->other->update(['is_active' => false]);

    Livewire::test(ListAdmins::class)
        ->assertTableActionHidden('deactivate', $this->other)
        ->callTableAction('reactivate', $this->other);

    expect($this->other->fresh()->is_active)->toBeTrue()
        ->and(AdminAuditLog::where('action', 'admin.reactivated')->count())->toBe(1);
});

it('has no create, edit or delete', function () {
    Livewire::test(ListAdmins::class)
        ->assertActionDoesNotExist('create')
        ->assertTableActionDoesNotExist('edit')
        ->assertTableActionDoesNotExist('delete');

    $this->get('/admin/admins/create')->assertNotFound();
});
