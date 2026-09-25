<?php

use App\Enums\FinishReason;
use App\Enums\LocationEvent;
use App\Enums\MessageRole;
use App\Enums\ProfileRole;
use App\Enums\Rating;
use App\Enums\ReminderStatus;
use App\Enums\ReminderTrigger;
use App\Enums\Sampling;
use App\Enums\SpeakMode;
use App\Enums\WebMode;
use App\Models\ActivityLog;
use App\Models\AlertSetting;
use App\Models\AuthEvent;
use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\Device;
use App\Models\DeviceActivityDay;
use App\Models\Location;
use App\Models\LocationSetting;
use App\Models\Place;
use App\Models\Profile;
use App\Models\Reminder;
use App\Models\User;
use App\Models\VipContact;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

it('stores chat content encrypted, never as plain text', function () {
    $message = ChatMessage::factory()->create(['content' => 'My bank PIN hint is the dog']);

    $raw = DB::table('chat_messages')->where('id', $message->id)->value('content');

    expect($raw)->not->toContain('bank PIN')
        ->and($message->fresh()->content)->toBe('My bank PIN hint is the dog');
});

it('round-trips enum casts', function () {
    $profile = Profile::factory()->restricted()->create(['web_mode' => WebMode::Never, 'sampling' => Sampling::Precise])->fresh();
    $message = ChatMessage::factory()->create([
        'role' => MessageRole::Assistant,
        'finish_reason' => FinishReason::Length,
        'rating' => Rating::Bad,
        'sampling' => Sampling::Creative,
    ])->fresh();
    $reminder = Reminder::factory()->arriveHome()->done()->create()->fresh();
    $location = Location::factory()->create(['event' => LocationEvent::Arrived])->fresh();
    $alerts = User::factory()->create()->alertSettings()->first();

    expect($profile->role)->toBe(ProfileRole::Restricted)
        ->and($profile->web_mode)->toBe(WebMode::Never)
        ->and($profile->sampling)->toBe(Sampling::Precise)
        ->and($message->role)->toBe(MessageRole::Assistant)
        ->and($message->finish_reason)->toBe(FinishReason::Length)
        ->and($message->rating)->toBe(Rating::Bad)
        ->and($message->sampling)->toBe(Sampling::Creative)
        ->and($reminder->trigger)->toBe(ReminderTrigger::ArriveHome)
        ->and($reminder->status)->toBe(ReminderStatus::Done)
        ->and($location->event)->toBe(LocationEvent::Arrived)
        ->and($alerts->speak_mode)->toBe(SpeakMode::Full);

    expect(DB::table('profiles')->where('id', $profile->id)->value('role'))->toBe('restricted');
});

it('allows web answers only for owner and member', function (ProfileRole $role, bool $allowed) {
    expect($role->allowsWeb())->toBe($allowed);
})->with([
    [ProfileRole::Owner, true],
    [ProfileRole::Member, true],
    [ProfileRole::Restricted, false],
    [ProfileRole::Guest, false],
]);

it('hides the PIN hash', function () {
    $profile = Profile::factory()->create();

    expect($profile->toArray())->not->toHaveKey('pin_hash')
        ->and($profile->hasPin())->toBeTrue()
        ->and(Profile::factory()->guest()->create()->hasPin())->toBeFalse();
});

it('builds the household id from the user id', function () {
    $user = User::factory()->create();

    expect($user->householdId())->toBe('h'.$user->id);
});

it('keeps client_uuid unique', function (string $model) {
    $first = $model::factory()->create();

    expect(fn () => $model::factory()->create(['client_uuid' => $first->client_uuid]))
        ->toThrow(QueryException::class);
})->with([
    'conversations' => Conversation::class,
    'chat_messages' => ChatMessage::class,
    'locations' => Location::class,
    'reminders' => Reminder::class,
    'activity_logs' => ActivityLog::class,
]);

it('creates location and alert settings with a household, using the plan defaults', function () {
    $user = User::factory()->create();

    $location = LocationSetting::where('user_id', $user->id)->sole();
    $alerts = AlertSetting::where('user_id', $user->id)->sole();

    expect($location->enabled)->toBeTrue()
        ->and($location->interval_minutes)->toBe(15)
        ->and($location->retention_days)->toBe(30)
        ->and($location->share_area)->toBeFalse()
        ->and($location->paused_until)->toBeNull()
        ->and($alerts->enabled)->toBeTrue()
        ->and($alerts->missed_after_minutes)->toBe(10)
        ->and($alerts->speak_mode)->toBe(SpeakMode::Full)
        ->and($alerts->headphones_only)->toBeFalse()
        ->and($alerts->only_at_home)->toBeFalse();
});

it('cascades a household delete to every household row', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();

    foreach ([$user, $other] as $household) {
        $profile = Profile::factory()->for($household)->owner()->create();
        $device = Device::factory()->for($household)->create();
        $conversation = Conversation::factory()->for($profile)->create();
        ChatMessage::factory()->for($conversation)->create();
        $place = Place::factory()->for($household)->home()->create();
        Location::factory()->for($household)->for($device)->create(['place_id' => $place->id]);
        VipContact::factory()->for($household)->create();
        Reminder::factory()->for($profile)->create();
        ActivityLog::factory()->for($household)->create(['profile_id' => $profile->id, 'device_id' => $device->id]);
        AuthEvent::factory()->for($household)->create(['profile_id' => $profile->id, 'device_id' => $device->id]);
        DeviceActivityDay::factory()->for($household)->for($device)->create();
        $household->createToken('device:'.$device->id, ['device']);
        $profile->createToken('device:'.$device->id, ['profile']);
    }

    $user->delete();

    $tables = [
        'profiles', 'devices', 'conversations', 'chat_messages', 'places', 'locations', 'location_settings',
        'vip_contacts', 'alert_settings', 'reminders', 'activity_logs', 'auth_events', 'device_activity_days',
    ];
    foreach ($tables as $table) {
        expect(DB::table($table)->count())->toBe(1, "{$table} should keep only the other household's row");
    }
    expect(DB::table('personal_access_tokens')->count())->toBe(2);
});

it('deletes a conversation\'s messages when it is soft-deleted, keeping the tombstone', function () {
    $conversation = Conversation::factory()->create();
    ChatMessage::factory()->for($conversation)->count(3)->create();

    $conversation->delete();

    expect(ChatMessage::count())->toBe(0)
        ->and(Conversation::withTrashed()->find($conversation->id)->trashed())->toBeTrue();
});

it('has all sixteen plan tables', function () {
    foreach ([
        'users', 'profiles', 'devices', 'conversations', 'chat_messages', 'places', 'locations', 'location_settings',
        'vip_contacts', 'alert_settings', 'reminders', 'activity_logs', 'auth_events', 'device_activity_days',
        'admins', 'admin_audit_logs',
    ] as $table) {
        expect(Schema::hasTable($table))->toBeTrue("missing {$table}");
    }
});
