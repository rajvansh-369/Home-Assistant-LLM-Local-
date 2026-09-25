<?php

use App\Models\Conversation;
use App\Models\Device;
use App\Models\Place;
use App\Models\Profile;
use App\Models\Reminder;
use App\Models\User;
use App\Models\VipContact;

beforeEach(function () {
    $this->travelTo('2026-09-24 10:00:00');
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->owner = Profile::factory()->for($this->household)->owner()->create(['name' => 'Rohan']);
    $this->member = Profile::factory()->for($this->household)->member()->create(['name' => 'Meera']);
    $this->guest = Profile::factory()->for($this->household)->guest()->create();
    $this->home = Place::factory()->for($this->household)->home()->create(['lat' => 12.9352, 'lng' => 77.6245]);
    $this->mom = VipContact::factory()->for($this->household)->create(['name' => 'Mom']);
    $this->ownerReminder = Reminder::factory()->for($this->owner)->create();
    $this->memberReminder = Reminder::factory()->for($this->member)->create();

    // Another household, which must never appear.
    $other = Profile::factory()->owner()->create();
    Place::factory()->for($other->user)->home()->create();
    VipContact::factory()->for($other->user)->create();
    Reminder::factory()->for($other)->create();

    $this->token = profileToken($this->owner, $this->device);
});

it('returns everything without since', function () {
    $response = $this->withToken($this->token)->getJson('/api/sync');

    $response->assertOk()
        ->assertJsonPath('server_time', '2026-09-24T10:00:00Z')
        ->assertJsonPath('household_id', 'h'.$this->household->id)
        ->assertJsonPath('me', ['id' => $this->owner->id, 'name' => 'Rohan', 'role' => 'owner'])
        ->assertJsonPath('profiles.*.id', [$this->member->id, $this->guest->id])
        ->assertJsonPath('home.id', $this->home->id)
        ->assertJsonPath('home.lat', 12.9352)
        ->assertJsonPath('home.radius_m', 150)
        ->assertJsonPath('location_settings.enabled', true)
        ->assertJsonPath('location_settings.interval_minutes', 15)
        ->assertJsonPath('alert_settings.speak_mode', 'full')
        ->assertJsonPath('vip_contacts.*.id', [$this->mom->id])
        ->assertJsonPath('reminders.*.id', [$this->ownerReminder->id])
        ->assertJsonPath('deleted', ['profiles' => [], 'reminders' => [], 'vip_contacts' => []]);
});

it('returns only changes and deleted ids since the last server_time', function () {
    $this->travelTo('2026-09-24 10:30:00');
    $since = $this->withToken($this->token)->getJson('/api/sync')->json('server_time');

    $this->travelTo('2026-09-24 11:00:00');
    $this->member->update(['name' => 'Meera S']);
    $newReminder = Reminder::factory()->for($this->owner)->create();
    $this->ownerReminder->delete();
    $this->mom->delete();
    $arjun = Profile::factory()->for($this->household)->restricted()->create();
    $arjun->delete();

    $this->withToken($this->token)->getJson('/api/sync?since='.$since)
        ->assertOk()
        ->assertJsonPath('server_time', '2026-09-24T11:00:00Z')
        ->assertJsonPath('profiles.*.name', ['Meera S'])
        ->assertJsonPath('vip_contacts', [])
        ->assertJsonPath('reminders.*.id', [$newReminder->id])
        ->assertJsonPath('home.id', $this->home->id)
        ->assertJsonPath('deleted', [
            'profiles' => [$arjun->id],
            'reminders' => [$this->ownerReminder->id],
            'vip_contacts' => [$this->mom->id],
        ]);
});

it('gives every profile the home, alerts and VIP contacts, but only its own reminders', function () {
    $this->withToken(profileToken($this->member, $this->device))->getJson('/api/sync')
        ->assertJsonPath('me.id', $this->member->id)
        ->assertJsonPath('home.id', $this->home->id)
        ->assertJsonPath('vip_contacts.*.id', [$this->mom->id])
        ->assertJsonPath('reminders.*.id', [$this->memberReminder->id]);
});

it('never returns another household\'s rows', function () {
    $body = $this->withToken($this->token)->getJson('/api/sync')->json();

    $otherIds = [
        'profiles' => Profile::where('user_id', '!=', $this->household->id)->pluck('id')->all(),
        'reminders' => Reminder::whereNotIn('profile_id', [$this->owner->id, $this->member->id])->pluck('id')->all(),
        'vip' => VipContact::where('user_id', '!=', $this->household->id)->pluck('id')->all(),
    ];

    expect(array_intersect(array_column($body['profiles'], 'id'), $otherIds['profiles']))->toBeEmpty()
        ->and(array_intersect(array_column($body['reminders'], 'id'), $otherIds['reminders']))->toBeEmpty()
        ->and(array_intersect(array_column($body['vip_contacts'], 'id'), $otherIds['vip']))->toBeEmpty();
});

it('sends null home when there is none', function () {
    $this->home->delete();

    $this->withToken($this->token)->getJson('/api/sync')->assertJsonPath('home', null);
});

it('validates since', function () {
    $this->withToken($this->token)->getJson('/api/sync?since=yesterday-ish')->assertUnprocessable();
});

it('refuses Guest on every Phase 4 route', function () {
    $token = profileToken($this->guest, $this->device);
    $conversation = Conversation::factory()->for($this->owner)->create();

    foreach ([
        ['GET', '/api/sync'],
        ['GET', '/api/conversations'],
        ['POST', '/api/conversations'],
        ['DELETE', "/api/conversations/{$conversation->id}"],
        ['GET', "/api/conversations/{$conversation->id}/messages"],
        ['POST', "/api/conversations/{$conversation->id}/messages"],
        ['PATCH', '/api/chat-messages/1'],
    ] as [$method, $url]) {
        $this->withToken($token)->json($method, $url)->assertForbidden();
    }
});

it('refuses a device token on every Phase 4 route', function () {
    $token = deviceToken($this->household, $this->device);

    foreach ([['GET', '/api/sync'], ['GET', '/api/conversations'], ['PATCH', '/api/chat-messages/1']] as [$method, $url]) {
        $this->withToken($token)->json($method, $url)->assertForbidden();
    }
});
