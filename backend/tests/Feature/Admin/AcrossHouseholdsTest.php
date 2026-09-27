<?php

use App\Enums\AuthEventType;
use App\Filament\Resources\ActivityLogs\Pages\ListActivityLogs;
use App\Filament\Resources\AuthEvents\Pages\ListAuthEvents;
use App\Filament\Resources\Devices\Pages\ListDevices;
use App\Models\ActivityLog;
use App\Models\Admin;
use App\Models\AuthEvent;
use App\Models\Device;
use App\Models\User;
use Filament\Facades\Filament;
use Livewire\Livewire;

beforeEach(function () {
    Filament::setCurrentPanel('admin');
    $this->actingAs(Admin::factory()->withMfa()->create(), 'admin');
    $this->one = User::factory()->create();
    $this->two = User::factory()->create();
});

it('lists every household\'s devices, with filters', function () {
    $current = Device::factory()->for($this->one)->seenToday()->create(['app_version' => '1.2.0']);
    $old = Device::factory()->for($this->two)->signedOut()->create(['app_version' => '1.0.0']);

    Livewire::test(ListDevices::class)
        ->assertCanSeeTableRecords([$current, $old])
        ->assertTableColumnFormattedStateSet('user_id', 'h'.$this->one->id, $current)
        ->filterTable('status', 'out')->assertCanSeeTableRecords([$old])->assertCanNotSeeTableRecords([$current])
        ->resetTableFilters()
        ->filterTable('app_version', '1.2.0')->assertCanSeeTableRecords([$current])->assertCanNotSeeTableRecords([$old])
        ->resetTableFilters()
        ->filterTable('household', ['household' => 'h'.$this->two->id])->assertCanSeeTableRecords([$old])->assertCanNotSeeTableRecords([$current]);

    $this->get('/admin/devices')->assertOk();
});

it('lists every household\'s activity, with a type filter', function () {
    $problem = ActivityLog::factory()->for($this->one)->serverProblem()->create();
    $alert = ActivityLog::factory()->for($this->two)->create(['type' => 'spoken_alert']);
    $newer = ActivityLog::factory()->for($this->two)->create(['type' => 'future_type']);

    Livewire::test(ListActivityLogs::class)
        ->assertCanSeeTableRecords([$problem, $alert, $newer])
        ->filterTable('type', 'server_problem')->assertCanSeeTableRecords([$problem])->assertCanNotSeeTableRecords([$alert, $newer])
        ->filterTable('type', 'future_type')->assertCanSeeTableRecords([$newer])->assertCanNotSeeTableRecords([$problem, $alert]);

    $this->get('/admin/activity')->assertOk();
});

it('lists every household\'s auth events, with a type filter', function () {
    $lockout = AuthEvent::factory()->for($this->one)->create(['type' => AuthEventType::Lockout, 'ip' => '198.51.100.7']);
    $login = AuthEvent::factory()->for($this->two)->create(['type' => AuthEventType::Login]);

    Livewire::test(ListAuthEvents::class)
        ->assertCanSeeTableRecords([$lockout, $login])
        ->assertSee('198.51.100.7')
        ->filterTable('type', 'lockout')->assertCanSeeTableRecords([$lockout])->assertCanNotSeeTableRecords([$login]);

    $this->get('/admin/security')->assertOk();
});

it('has no create, edit or delete on these pages', function (string $page) {
    Livewire::test($page)
        ->assertActionDoesNotExist('create')
        ->assertTableActionDoesNotExist('edit')
        ->assertTableActionDoesNotExist('delete');
})->with([ListDevices::class, ListActivityLogs::class, ListAuthEvents::class]);

it('orders the navigation as §6 lists it', function () {
    $labels = collect(Filament::getCurrentPanel()->getNavigation())
        ->flatMap(fn ($group) => $group->getItems())
        ->map(fn ($item) => $item->getLabel())
        ->values()
        ->all();

    expect(array_slice($labels, 0, 7))->toBe(['Dashboard', 'Households', 'Devices', 'Activity', 'Security', 'Audit log', 'Admins']);
});
