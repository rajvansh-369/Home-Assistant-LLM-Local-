<?php

use App\Filament\Resources\Households\Pages\ListHouseholds;
use App\Models\Admin;
use App\Models\Conversation;
use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Filament\Facades\Filament;
use Illuminate\Support\Facades\DB;
use Livewire\Livewire;

beforeEach(function () {
    Filament::setCurrentPanel('admin');
    $this->actingAs(Admin::factory()->withMfa()->create(), 'admin');
});

it('lists the seeded households, most recently active first', function () {
    $this->app['env'] = 'local';
    $this->seed(DemoSeeder::class);

    $rohan = User::where('email', 'rohan@example.com')->sole();
    $expected = User::query()->withMax('devices', 'last_seen_at')->get()
        ->sortByDesc(fn (User $user) => [$user->devices_max_last_seen_at, $user->id])
        ->take(10);

    Livewire::test(ListHouseholds::class)
        ->assertCanSeeTableRecords($expected, inOrder: true)
        ->assertCountTableRecords(User::count())
        ->assertSee('h'.$rohan->id);

    $this->get('/admin/households')->assertOk()->assertSee('rohan@example.com');
});

it('shows the counts for each household', function () {
    $household = User::factory()->create();
    Profile::factory()->owner()->for($household)->create();
    Profile::factory()->member()->for($household)->create();
    Profile::factory()->guest()->for($household)->create();
    Profile::factory()->member()->for($household)->create(['deleted_at' => now()]);
    Device::factory()->for($household)->create(['last_seen_at' => now()->subHour()]);
    Device::factory()->for($household)->signedOut()->create(['last_seen_at' => now()->subDays(3)]);
    $profile = $household->profiles()->first();
    Conversation::factory()->for($profile)->create(['last_message_at' => now()->subDays(2)]);
    Conversation::factory()->for($profile)->create(['last_message_at' => now()->subDays(40)]);

    Livewire::test(ListHouseholds::class)
        ->assertTableColumnFormattedStateSet('id', 'h'.$household->id, $household)
        ->assertTableColumnStateSet('profiles_count', 2, $household)
        ->assertTableColumnStateSet('devices_count', 1, $household)
        ->assertTableColumnStateSet('active_chats_count', 1, $household)
        ->assertTableColumnStateSet('status', 'Active', $household);
});

it('searches by name, email and household id', function () {
    $rohan = User::factory()->create(['name' => 'Rohan', 'email' => 'rohan@example.com']);
    $priya = User::factory()->create(['name' => 'Priya', 'email' => 'priya@example.org']);

    Livewire::test(ListHouseholds::class)
        ->searchTable('Priya')->assertCanSeeTableRecords([$priya])->assertCanNotSeeTableRecords([$rohan])
        ->searchTable('rohan@example')->assertCanSeeTableRecords([$rohan])->assertCanNotSeeTableRecords([$priya])
        ->searchTable('h'.$priya->id)->assertCanSeeTableRecords([$priya])->assertCanNotSeeTableRecords([$rohan])
        ->searchTable((string) $rohan->id)->assertCanSeeTableRecords([$rohan])->assertCanNotSeeTableRecords([$priya]);
});

it('filters by status', function () {
    $active = User::factory()->create();
    $suspended = User::factory()->suspended()->create();

    Livewire::test(ListHouseholds::class)
        ->filterTable('status', 'suspended')->assertCanSeeTableRecords([$suspended])->assertCanNotSeeTableRecords([$active])
        ->filterTable('status', 'active')->assertCanSeeTableRecords([$active])->assertCanNotSeeTableRecords([$suspended]);
});

it('filters by activity in the last 7 or 30 days', function () {
    $week = User::factory()->create();
    Device::factory()->for($week)->create(['last_seen_at' => now()->subDays(2)]);
    $month = User::factory()->create();
    Device::factory()->for($month)->create(['last_seen_at' => now()->subDays(20)]);
    $idle = User::factory()->create();
    Device::factory()->for($idle)->create(['last_seen_at' => now()->subDays(60)]);

    Livewire::test(ListHouseholds::class)
        ->filterTable('active', '7')->assertCanSeeTableRecords([$week])->assertCanNotSeeTableRecords([$month, $idle])
        ->filterTable('active', '30')->assertCanSeeTableRecords([$week, $month])->assertCanNotSeeTableRecords([$idle]);
});

it('filters by created date, in the admin timezone', function () {
    config(['aster.admin.timezone' => 'Asia/Kolkata']);
    // 23:00 UTC on the 9th is 04:30 on the 10th in Asia/Kolkata.
    $tenth = User::factory()->create(['created_at' => '2026-09-09 23:00:00']);
    $ninth = User::factory()->create(['created_at' => '2026-09-09 18:00:00']);

    Livewire::test(ListHouseholds::class)
        ->filterTable('created_at', ['from' => '2026-09-10', 'until' => '2026-09-10'])
        ->assertCanSeeTableRecords([$tenth])
        ->assertCanNotSeeTableRecords([$ninth]);
});

it('runs the same number of queries for 3 households as for 12', function () {
    $count = function (): int {
        DB::flushQueryLog();
        DB::enableQueryLog();
        Livewire::test(ListHouseholds::class);
        DB::disableQueryLog();

        return count(DB::getQueryLog());
    };

    foreach (range(1, 3) as $ignored) {
        $household = User::factory()->create();
        Profile::factory()->owner()->for($household)->create();
        Device::factory()->for($household)->seenToday()->create();
    }
    $few = $count();

    foreach (range(1, 9) as $ignored) {
        $household = User::factory()->create();
        Profile::factory()->owner()->for($household)->create();
        Device::factory()->for($household)->seenToday()->create();
    }

    expect($count())->toBe($few);
});

it('has no create, edit or delete', function () {
    Livewire::test(ListHouseholds::class)
        ->assertActionDoesNotExist('create')
        ->assertTableActionDoesNotExist('edit')
        ->assertTableActionDoesNotExist('delete');

    $this->get('/admin/households/create')->assertNotFound();
});
