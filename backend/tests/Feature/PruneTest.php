<?php

use App\Models\ActivityLog;
use App\Models\AdminAuditLog;
use App\Models\AuthEvent;
use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\Device;
use App\Models\DeviceActivityDay;
use App\Models\Location;
use App\Models\Profile;
use App\Models\Reminder;
use App\Models\User;
use App\Models\VipContact;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Str;

beforeEach(function () {
    config(['aster.admin.timezone' => 'Asia/Kolkata']);
    $this->travelTo('2026-09-24 02:30:00'); // 08:00 in Kolkata
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
});

it('prunes locations by each household\'s retention setting', function () {
    $this->household->locationSettings->update(['retention_days' => 7]);
    $old = Location::factory()->for($this->household)->for($this->device)->create(['recorded_at' => now()->subDays(7)->subMinute()]);
    $kept = Location::factory()->for($this->household)->for($this->device)->create(['recorded_at' => now()->subDays(7)->addMinute()]);

    $other = User::factory()->create(); // default 30 days
    $otherDevice = Device::factory()->for($other)->create();
    $otherKept = Location::factory()->for($other)->for($otherDevice)->create(['recorded_at' => now()->subDays(29)]);
    $otherOld = Location::factory()->for($other)->for($otherDevice)->create(['recorded_at' => now()->subDays(31)]);

    $this->artisan('aster:prune')->assertSuccessful();

    expect(Location::pluck('id')->sort()->values()->all())->toBe(collect([$kept->id, $otherKept->id])->sort()->values()->all())
        ->and(Location::find($old->id))->toBeNull()
        ->and(Location::find($otherOld->id))->toBeNull();
});

it('keeps activity and auth events for 90 days', function () {
    $oldActivity = ActivityLog::factory()->for($this->household)->create(['occurred_at' => now()->subDays(90)->subMinute()]);
    $keptActivity = ActivityLog::factory()->for($this->household)->create(['occurred_at' => now()->subDays(90)->addMinute()]);
    $oldAuth = AuthEvent::factory()->for($this->household)->create(['created_at' => now()->subDays(90)->subMinute()]);
    $keptAuth = AuthEvent::factory()->for($this->household)->create(['created_at' => now()->subDays(90)->addMinute()]);

    $this->artisan('aster:prune')->assertSuccessful();

    expect(ActivityLog::pluck('id')->all())->toBe([$keptActivity->id])
        ->and(AuthEvent::pluck('id')->all())->toBe([$keptAuth->id])
        ->and($oldActivity->exists && $oldAuth->exists)->toBeTrue();
});

it('keeps device activity days for 400 local days', function () {
    // Today in Kolkata is 2026-09-24; 400 days before is 2025-08-20.
    $kept = DeviceActivityDay::factory()->for($this->household)->for($this->device)->create(['day' => '2025-08-20']);
    DeviceActivityDay::factory()->for($this->household)->for($this->device)->create(['day' => '2025-08-19']);

    $this->artisan('aster:prune')->assertSuccessful();

    expect(DeviceActivityDay::pluck('id')->all())->toBe([$kept->id]);
});

it('keeps the admin audit log for 365 days', function () {
    AdminAuditLog::factory()->create(['created_at' => now()->subDays(365)->subMinute()]);
    $kept = AdminAuditLog::factory()->create(['created_at' => now()->subDays(365)->addMinute()]);

    $this->artisan('aster:prune')->assertSuccessful();

    expect(AdminAuditLog::pluck('id')->all())->toBe([$kept->id]);
});

it('force-deletes soft-deleted rows and tombstones after 30 days', function () {
    $owner = Profile::factory()->for($this->household)->owner()->create();
    $make = function (string $model, array $state, bool $old) {
        $row = $model::factory()->create($state);
        $row->deleted_at = $old ? now()->subDays(30)->subMinute() : now()->subDays(29);
        $row->save();

        return $row;
    };

    $oldProfile = $make(Profile::class, ['user_id' => $this->household->id], true);
    $recentProfile = $make(Profile::class, ['user_id' => $this->household->id], false);
    $oldReminder = $make(Reminder::class, ['profile_id' => $owner->id], true);
    $recentReminder = $make(Reminder::class, ['profile_id' => $owner->id], false);
    $oldVip = $make(VipContact::class, ['user_id' => $this->household->id], true);
    $recentVip = $make(VipContact::class, ['user_id' => $this->household->id], false);
    $oldTombstone = $make(Conversation::class, ['profile_id' => $owner->id], true);
    $recentTombstone = $make(Conversation::class, ['profile_id' => $owner->id], false);
    $live = Conversation::factory()->for($owner)->create(['created_at' => now()->subYear()]);
    ChatMessage::factory()->for($live)->create();

    $this->artisan('aster:prune')->assertSuccessful();

    expect(Profile::withTrashed()->pluck('id')->sort()->values()->all())->toBe(collect([$owner->id, $recentProfile->id])->sort()->values()->all())
        ->and(Reminder::withTrashed()->pluck('id')->all())->toBe([$recentReminder->id])
        ->and(VipContact::withTrashed()->pluck('id')->all())->toBe([$recentVip->id])
        ->and(Conversation::withTrashed()->pluck('id')->sort()->values()->all())->toBe(collect([$recentTombstone->id, $live->id])->sort()->values()->all())
        ->and(ChatMessage::count())->toBe(1)
        ->and([$oldProfile, $oldReminder, $oldVip, $oldTombstone])->toHaveCount(4);
});

it('is scheduled daily with sanctum:prune-expired', function () {
    $events = collect(app(Schedule::class)->events())
        ->mapWithKeys(fn ($event) => [trim(Str::after($event->command, 'artisan'), " '\"") => $event->expression]);

    expect($events->all())->toMatchArray([
        'aster:prune' => '30 2 * * *',
        'sanctum:prune-expired --hours=24' => '0 0 * * *',
    ]);
});
