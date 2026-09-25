<?php

use App\Models\Device;
use App\Models\Place;
use App\Models\Profile;
use App\Models\User;

function homeFields(array $overrides = []): array
{
    return array_merge([
        'name' => 'Home',
        'address' => '14 Rose Garden Road, Bengaluru',
        'lat' => 12.9352,
        'lng' => 77.6245,
        'radius_m' => 150,
        'wifi_ssid' => 'HomeNet',
        'llm_url' => 'http://192.168.1.20:8000',
    ], $overrides);
}

beforeEach(function () {
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->owner = Profile::factory()->for($this->household)->owner()->create();
    $this->token = profileToken($this->owner, $this->device);
});

it('answers 404 when no home is saved', function () {
    $this->withToken($this->token)->getJson('/api/places/home')
        ->assertNotFound()->assertExactJson(['message' => 'No home is saved yet.']);
});

it('saves the home, then updates the same row', function () {
    $this->withToken($this->token)->putJson('/api/places/home', homeFields())
        ->assertOk()
        ->assertJsonPath('data.name', 'Home')
        ->assertJsonPath('data.lat', 12.9352)
        ->assertJsonPath('data.lng', 77.6245)
        ->assertJsonPath('data.llm_url', 'http://192.168.1.20:8000');

    $this->withToken($this->token)->putJson('/api/places/home', homeFields(['radius_m' => 300, 'wifi_ssid' => null]))
        ->assertOk()->assertJsonPath('data.radius_m', 300)->assertJsonPath('data.wifi_ssid', null);

    expect(Place::count())->toBe(1);
    $this->withToken($this->token)->getJson('/api/places/home')->assertOk()->assertJsonPath('data.radius_m', 300);
});

it('validates the home', function (array $fields, string $error) {
    $this->withToken($this->token)->putJson('/api/places/home', homeFields($fields))
        ->assertUnprocessable()->assertJsonValidationErrors($error);
})->with([
    'another name' => [['name' => 'Office'], 'name'],
    'radius too small' => [['radius_m' => 49], 'radius_m'],
    'radius too big' => [['radius_m' => 1001], 'radius_m'],
    'latitude' => [['lat' => 91], 'lat'],
    'longitude' => [['lng' => -181], 'lng'],
    'ftp llm url' => [['llm_url' => 'ftp://192.168.1.20'], 'llm_url'],
    'not a url' => [['llm_url' => 'home pc'], 'llm_url'],
]);

it('is for the Owner only', function () {
    $member = Profile::factory()->for($this->household)->member()->create();

    $this->withToken(profileToken($member, $this->device))->getJson('/api/places/home')->assertForbidden();
});
