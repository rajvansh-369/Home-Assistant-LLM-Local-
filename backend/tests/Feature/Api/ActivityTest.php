<?php

use App\Models\ActivityLog;
use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Support\Str;

function activityEvent(array $overrides = []): array
{
    return array_merge([
        'client_uuid' => (string) Str::uuid(),
        'type' => 'spoken_alert',
        'summary' => 'Read out a message from Mom',
        'meta' => ['source' => 'whatsapp'],
        'occurred_at' => '2026-09-24T10:00:00Z',
    ], $overrides);
}

beforeEach(function () {
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->deviceToken = deviceToken($this->household, $this->device);
    $this->owner = Profile::factory()->for($this->household)->owner()->create();
    $this->member = Profile::factory()->for($this->household)->member()->create();
});

describe('batch', function () {
    it('stores events for the device\'s household and skips repeats', function () {
        $events = [activityEvent(['profile_id' => $this->member->id]), activityEvent(['type' => 'arrived_home', 'meta' => null])];

        $this->withToken($this->deviceToken)->postJson('/api/activity/batch', ['events' => $events])
            ->assertOk()->assertExactJson(['accepted' => 2, 'duplicates' => 0]);
        $this->withToken($this->deviceToken)->postJson('/api/activity/batch', ['events' => [...$events, activityEvent()]])
            ->assertExactJson(['accepted' => 1, 'duplicates' => 2]);

        expect(ActivityLog::where('user_id', $this->household->id)->where('device_id', $this->device->id)->count())->toBe(3)
            ->and(ActivityLog::where('client_uuid', $events[0]['client_uuid'])->sole()->meta)->toBe(['source' => 'whatsapp']);
    });

    it('accepts a type the server doesn\'t know yet', function () {
        $this->withToken($this->deviceToken)->postJson('/api/activity/batch', ['events' => [activityEvent(['type' => 'battery_low'])]])
            ->assertJsonPath('accepted', 1);
    });

    it('refuses a profile from another household', function () {
        $theirs = Profile::factory()->owner()->create();

        $this->withToken($this->deviceToken)->postJson('/api/activity/batch', ['events' => [activityEvent(['profile_id' => $theirs->id])]])
            ->assertUnprocessable()
            ->assertJsonPath('errors', ['events.0.profile_id' => ['This profile isn\'t in the household.']]);
    });

    it('validates events', function (Closure $events, string $error) {
        $this->withToken($this->deviceToken)->postJson('/api/activity/batch', ['events' => $events()])
            ->assertUnprocessable()->assertJsonValidationErrors($error);
    })->with([
        'empty' => [fn () => [], 'events'],
        'over 500' => [fn () => array_map(fn () => activityEvent(), range(1, 501)), 'events'],
        'type with spaces' => [fn () => [activityEvent(['type' => 'Spoken Alert'])], 'events.0.type'],
        'long summary' => [fn () => [activityEvent(['summary' => str_repeat('a', 201)])], 'events.0.summary'],
        'meta over 2 KB' => [fn () => [activityEvent(['meta' => ['blob' => str_repeat('a', 2100)]])], 'events.0.meta'],
    ]);
});

describe('index', function () {
    beforeEach(function () {
        $this->ownerEvent = ActivityLog::factory()->for($this->household)->create(['profile_id' => $this->owner->id, 'occurred_at' => now()->subHours(3)]);
        $this->memberEvent = ActivityLog::factory()->for($this->household)->create(['profile_id' => $this->member->id, 'occurred_at' => now()->subHours(2)]);
        $this->deviceEvent = ActivityLog::factory()->for($this->household)->create(['profile_id' => null, 'occurred_at' => now()->subHour()]);
        ActivityLog::factory()->create(['profile_id' => null]); // another household
    });

    it('shows the Owner its own events and device events, newest first', function () {
        $this->withToken(profileToken($this->owner, $this->device))->getJson('/api/activity')
            ->assertOk()
            ->assertJsonPath('data.*.id', [$this->deviceEvent->id, $this->ownerEvent->id])
            ->assertJsonPath('meta.next_cursor', null);
    });

    it('shows a member only its own events', function () {
        $this->withToken(profileToken($this->member, $this->device))->getJson('/api/activity')
            ->assertJsonPath('data.*.id', [$this->memberEvent->id]);
    });

    it('pages with a cursor', function () {
        ActivityLog::factory()->for($this->household)->count(60)->create(['profile_id' => $this->member->id]);
        $token = profileToken($this->member, $this->device);

        $first = $this->withToken($token)->getJson('/api/activity')->assertJsonCount(50, 'data');
        $this->withToken($token)->getJson('/api/activity?cursor='.$first->json('meta.next_cursor'))->assertJsonCount(11, 'data');
    });
});
