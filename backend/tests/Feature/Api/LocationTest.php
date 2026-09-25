<?php

use App\Models\Device;
use App\Models\Location;
use App\Models\Place;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Support\Str;

function point(array $overrides = []): array
{
    return array_merge([
        'client_uuid' => (string) Str::uuid(),
        'lat' => 12.9352,
        'lng' => 77.6245,
        'accuracy_m' => 12.5,
        'event' => 'periodic',
        'recorded_at' => '2026-09-24T10:00:00Z',
    ], $overrides);
}

beforeEach(function () {
    $this->travelTo('2026-09-24 12:00:00');
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->deviceToken = deviceToken($this->household, $this->device);
    $this->owner = Profile::factory()->for($this->household)->owner()->create();
});

describe('batch', function () {
    it('stores points against the token\'s device and household', function () {
        $home = Place::factory()->for($this->household)->home()->create();

        $this->withToken($this->deviceToken)->postJson('/api/locations/batch', ['points' => [
            point(), point(['event' => 'arrived', 'place_id' => $home->id]),
        ]])->assertOk()->assertExactJson(['accepted' => 2, 'duplicates' => 0, 'discarded' => 0]);

        expect(Location::where('user_id', $this->household->id)->where('device_id', $this->device->id)->count())->toBe(2);
    });

    it('skips points it already has', function () {
        $points = [point(), point()];

        $this->withToken($this->deviceToken)->postJson('/api/locations/batch', ['points' => $points]);
        $this->withToken($this->deviceToken)->postJson('/api/locations/batch', ['points' => [...$points, point()]])
            ->assertExactJson(['accepted' => 1, 'duplicates' => 2, 'discarded' => 0]);

        expect(Location::count())->toBe(3);
    });

    it('discards points while tracking is off', function () {
        $this->household->locationSettings->update(['enabled' => false]);

        $this->withToken($this->deviceToken)->postJson('/api/locations/batch', ['points' => [point(), point()]])
            ->assertExactJson(['accepted' => 0, 'duplicates' => 0, 'discarded' => 2]);

        expect(Location::count())->toBe(0);
    });

    it('discards points while paused, and takes them again once the pause ends', function () {
        $this->household->locationSettings->update(['paused_until' => now()->addHour()]);

        $this->withToken($this->deviceToken)->postJson('/api/locations/batch', ['points' => [point()]])
            ->assertJsonPath('discarded', 1);

        $this->travel(61)->minutes();
        $this->withToken($this->deviceToken)->postJson('/api/locations/batch', ['points' => [point()]])
            ->assertJsonPath('accepted', 1);
    });

    it('refuses a place from another household', function () {
        $theirs = Place::factory()->create();

        $this->withToken($this->deviceToken)->postJson('/api/locations/batch', ['points' => [point(['place_id' => $theirs->id])]])
            ->assertUnprocessable()->assertJsonValidationErrors('points.0.place_id');
    });

    it('validates the batch', function (Closure $points, string $error) {
        $this->withToken($this->deviceToken)->postJson('/api/locations/batch', ['points' => $points()])
            ->assertUnprocessable()->assertJsonValidationErrors($error);
    })->with([
        'empty' => [fn () => [], 'points'],
        'over 500' => [fn () => array_map(fn () => point(), range(1, 501)), 'points'],
        'bad event' => [fn () => [point(['event' => 'teleported'])], 'points.0.event'],
        'latitude' => [fn () => [point(['lat' => 95])], 'points.0.lat'],
        'no time' => [fn () => [point(['recorded_at' => null])], 'points.0.recorded_at'],
    ]);

    it('needs a device token', function () {
        $this->withToken(profileToken($this->owner, $this->device))->postJson('/api/locations/batch', ['points' => [point()]])
            ->assertForbidden();
    });
});

describe('index', function () {
    it('returns one local day in the requested timezone', function () {
        // 23:30 on 24 Sep in Kolkata is 18:00 UTC; 00:10 on 25 Sep there is 18:40 UTC.
        $late = Location::factory()->for($this->household)->for($this->device)->create(['recorded_at' => '2026-09-24 18:00:00']);
        Location::factory()->for($this->household)->for($this->device)->create(['recorded_at' => '2026-09-24 18:40:00']);
        $early = Location::factory()->for($this->household)->for($this->device)->create(['recorded_at' => '2026-09-23 18:31:00']);
        Location::factory()->for($this->household)->for($this->device)->create(['recorded_at' => '2026-09-23 18:29:00']);
        Location::factory()->create(['recorded_at' => '2026-09-24 10:00:00']); // another household

        $this->withToken(profileToken($this->owner, $this->device))->getJson('/api/locations?date=2026-09-24&tz=Asia/Kolkata')
            ->assertOk()
            ->assertJsonPath('data.*.id', [$early->id, $late->id])
            ->assertJsonPath('data.1.recorded_at', '2026-09-24T18:00:00Z')
            ->assertJsonPath('meta', ['date' => '2026-09-24', 'tz' => 'Asia/Kolkata', 'count' => 2]);
    });

    it('defaults to UTC', function () {
        Location::factory()->for($this->household)->for($this->device)->create(['recorded_at' => '2026-09-24 18:00:00']);

        $this->withToken(profileToken($this->owner, $this->device))->getJson('/api/locations?date=2026-09-24')
            ->assertJsonPath('meta.tz', 'UTC')->assertJsonPath('meta.count', 1);
    });

    it('validates date and tz', function () {
        $token = profileToken($this->owner, $this->device);

        $this->withToken($token)->getJson('/api/locations')->assertUnprocessable()->assertJsonValidationErrors('date');
        $this->withToken($token)->getJson('/api/locations?date=2026-09-24&tz=Mars/Olympus')->assertJsonValidationErrors('tz');
    });

    it('is for the Owner only', function () {
        $member = Profile::factory()->for($this->household)->member()->create();

        $this->withToken(profileToken($member, $this->device))->getJson('/api/locations?date=2026-09-24')->assertForbidden();
    });
});
