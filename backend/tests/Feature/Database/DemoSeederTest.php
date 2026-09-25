<?php

use App\Enums\ProfileRole;
use App\Models\ChatMessage;
use App\Models\DeviceActivityDay;
use App\Models\Location;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Support\Facades\Hash;

it('seeds the demo households on a fresh database', function () {
    $this->seed(DemoSeeder::class);

    $rohan = User::where('email', 'rohan@example.com')->sole();
    $profiles = $rohan->profiles()->orderBy('id')->get();

    expect(User::count())->toBe(26)
        ->and(Hash::check('password', $rohan->password))->toBeTrue()
        ->and($profiles->pluck('name')->all())->toBe(['Rohan', 'Meera', 'Arjun', 'Guest'])
        ->and($profiles->pluck('role')->all())->toBe([ProfileRole::Owner, ProfileRole::Member, ProfileRole::Restricted, ProfileRole::Guest])
        ->and(Hash::check('123456', $profiles[0]->pin_hash))->toBeTrue()
        ->and($profiles[3]->pin_hash)->toBeNull()
        ->and($rohan->home)->not->toBeNull()
        ->and($rohan->conversations()->count())->toBe(3)
        ->and($rohan->vipContacts()->pluck('name')->all())->toBe(['Mom', 'Neha'])
        ->and(Location::where('user_id', $rohan->id)->count())->toBeGreaterThan(0)
        ->and(ChatMessage::count())->toBeGreaterThan(8)
        ->and(DeviceActivityDay::count())->toBeGreaterThan(26);
});
