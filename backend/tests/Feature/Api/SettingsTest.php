<?php

use App\Models\Device;
use App\Models\Profile;
use App\Models\User;

beforeEach(function () {
    $this->household = User::factory()->create();
    $device = Device::factory()->for($this->household)->create();
    $this->owner = Profile::factory()->for($this->household)->owner()->create();
    $this->member = Profile::factory()->for($this->household)->member()->create();
    $this->token = profileToken($this->owner, $device);
    $this->memberToken = profileToken($this->member, $device);
});

describe('location settings', function () {
    it('shows the defaults', function () {
        $this->withToken($this->token)->getJson('/api/location-settings')
            ->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.interval_minutes', 15)
            ->assertJsonPath('data.retention_days', 30)
            ->assertJsonPath('data.share_area', false)
            ->assertJsonPath('data.paused_until', null);
    });

    it('updates the fields it is sent', function () {
        $this->withToken($this->token)->putJson('/api/location-settings', [
            'interval_minutes' => 30, 'retention_days' => 7, 'paused_until' => '2026-09-24T20:00:00+05:30',
        ])->assertOk()
            ->assertJsonPath('data.interval_minutes', 30)
            ->assertJsonPath('data.retention_days', 7)
            ->assertJsonPath('data.paused_until', '2026-09-24T14:30:00Z')
            ->assertJsonPath('data.enabled', true);
    });

    it('validates the ranges', function (array $fields, string $error) {
        $this->withToken($this->token)->putJson('/api/location-settings', $fields)
            ->assertUnprocessable()->assertJsonValidationErrors($error);
    })->with([
        [['interval_minutes' => 14], 'interval_minutes'],
        [['interval_minutes' => 121], 'interval_minutes'],
        [['retention_days' => 0], 'retention_days'],
        [['retention_days' => 91], 'retention_days'],
        [['enabled' => 'maybe'], 'enabled'],
    ]);

    it('is for the Owner only', function () {
        $this->withToken($this->memberToken)->getJson('/api/location-settings')->assertForbidden();
        $this->withToken($this->memberToken)->putJson('/api/location-settings', ['enabled' => false])->assertForbidden();
    });
});

describe('alert settings', function () {
    it('shows and updates the settings with HH:MM quiet hours', function () {
        $this->withToken($this->token)->getJson('/api/alert-settings')
            ->assertOk()->assertJsonPath('data.speak_mode', 'full')->assertJsonPath('data.missed_after_minutes', 10);

        $this->withToken($this->token)->putJson('/api/alert-settings', [
            'speak_mode' => 'name', 'quiet_start' => '22:30', 'quiet_end' => '07:00',
            'urgent_keywords' => ['urgent', 'hospital'], 'only_at_home' => true,
        ])->assertOk()
            ->assertJsonPath('data.speak_mode', 'name')
            ->assertJsonPath('data.quiet_start', '22:30')
            ->assertJsonPath('data.quiet_end', '07:00')
            ->assertJsonPath('data.urgent_keywords', ['urgent', 'hospital'])
            ->assertJsonPath('data.only_at_home', true);
    });

    it('validates the values', function (array $fields, string $error) {
        $this->withToken($this->token)->putJson('/api/alert-settings', $fields)
            ->assertUnprocessable()->assertJsonValidationErrors($error);
    })->with([
        [['missed_after_minutes' => 0], 'missed_after_minutes'],
        [['missed_after_minutes' => 121], 'missed_after_minutes'],
        [['speak_mode' => 'shout'], 'speak_mode'],
        [['quiet_start' => '25:00'], 'quiet_start'],
        [['quiet_end' => '7pm'], 'quiet_end'],
        [['urgent_keywords' => array_map(fn ($i) => "word{$i}", range(1, 21))], 'urgent_keywords'],
        [['urgent_keywords' => [str_repeat('a', 41)]], 'urgent_keywords.0'],
    ]);

    it('is for the Owner only', function () {
        $this->withToken($this->memberToken)->getJson('/api/alert-settings')->assertForbidden();
    });
});
