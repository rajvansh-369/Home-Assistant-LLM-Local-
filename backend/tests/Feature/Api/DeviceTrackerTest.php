<?php

use App\Models\Device;
use App\Models\DeviceActivityDay;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

beforeEach(function () {
    Route::middleware(['auth:sanctum', 'device'])->get('api/_test/device', fn () => ['ok' => true]);
    Route::middleware(['auth:sanctum', 'profile'])->get('api/_test/profile', fn () => ['ok' => true]);

    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create(['last_seen_at' => null, 'app_version' => '1.0.0']);
    $this->token = deviceToken($this->household, $this->device);
});

it('writes last_seen_at at most once a minute', function () {
    $this->travelTo('2026-09-24 10:00:00');
    $this->withToken($this->token)->getJson('api/_test/device')->assertOk();
    expect($this->device->fresh()->last_seen_at->toDateTimeString())->toBe('2026-09-24 10:00:00');

    $this->travelTo('2026-09-24 10:00:30');
    $this->withToken($this->token)->getJson('api/_test/device')->assertOk();
    expect($this->device->fresh()->last_seen_at->toDateTimeString())->toBe('2026-09-24 10:00:00');

    $this->travelTo('2026-09-24 10:01:05');
    $this->withToken($this->token)->getJson('api/_test/device')->assertOk();
    expect($this->device->fresh()->last_seen_at->toDateTimeString())->toBe('2026-09-24 10:01:05');
});

it('records one activity day per device per day', function () {
    $this->travelTo('2026-09-24 10:00:00');
    $this->withToken($this->token)->getJson('api/_test/device');
    $this->travelTo('2026-09-24 12:00:00');
    $this->withToken($this->token)->getJson('api/_test/device');

    expect(DeviceActivityDay::count())->toBe(1);

    $this->travelTo('2026-09-25 10:00:00');
    $this->withToken($this->token)->getJson('api/_test/device');

    expect(DeviceActivityDay::orderBy('day')->pluck('day')->map->toDateString()->all())
        ->toBe(['2026-09-24', '2026-09-25']);
});

it('dates activity days in ASTER_ADMIN_TIMEZONE', function () {
    config(['aster.admin.timezone' => 'Asia/Kolkata']);
    $this->travelTo('2026-09-24 20:00:00'); // 01:30 on 25 Sep in Kolkata

    $this->withToken($this->token)->getJson('api/_test/device');

    expect(DeviceActivityDay::sole()->day->toDateString())->toBe('2026-09-25');
});

it('does not write on a repeat request', function () {
    $this->withToken($this->token)->getJson('api/_test/device');

    $writes = 0;
    DB::listen(function ($query) use (&$writes) {
        if (preg_match('/^\s*(insert|update|delete)/i', $query->sql) && ! str_contains($query->sql, 'personal_access_tokens')) {
            $writes++;
        }
    });

    $this->withToken($this->token)->getJson('api/_test/device')->assertOk();

    expect($writes)->toBe(0);
});

it('stores X-App-Version when it changes', function () {
    $this->withToken($this->token)->withHeader('X-App-Version', '1.2.0')->getJson('api/_test/device');
    expect($this->device->fresh()->app_version)->toBe('1.2.0');

    $this->withToken($this->token)->withHeader('X-App-Version', '<script>')->getJson('api/_test/device');
    expect($this->device->fresh()->app_version)->toBe('1.2.0');
});

it('tracks profile tokens against their device', function () {
    $owner = Profile::factory()->for($this->household)->owner()->create();

    $this->withToken(profileToken($owner, $this->device))->getJson('api/_test/profile')->assertOk();

    expect($this->device->fresh()->last_seen_at)->not->toBeNull()
        ->and(DeviceActivityDay::sole()->device_id)->toBe($this->device->id);
});
