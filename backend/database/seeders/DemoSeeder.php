<?php

namespace Database\Seeders;

use App\Enums\ActivityType;
use App\Enums\AuthEventType;
use App\Enums\LocationEvent;
use App\Enums\MessageSource;
use App\Enums\SpeakMode;
use App\Models\ActivityLog;
use App\Models\AuthEvent;
use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\Device;
use App\Models\DeviceActivityDay;
use App\Models\Location;
use App\Models\Place;
use App\Models\Profile;
use App\Models\Reminder;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Sample data for local development: the Rohan household from the plan,
 * plus 25 random households so the admin dashboard has numbers to show.
 * Every profile except Guest has PIN 123456.
 */
class DemoSeeder extends Seeder
{
    private const HOME_LAT = 12.9352;

    private const HOME_LNG = 77.6245;

    public function run(): void
    {
        // One transaction: much faster than committing every insert.
        DB::transaction(function (): void {
            $this->seedRohan();

            for ($i = 0; $i < 25; $i++) {
                $this->seedRandomHousehold(CarbonImmutable::now()->subDays(fake()->numberBetween(0, 90))->subMinutes(fake()->numberBetween(0, 1439)));
            }
        });
    }

    private function seedRohan(): void
    {
        $createdAt = CarbonImmutable::now()->subDays(45);

        $user = User::factory()->create([
            'name' => 'Rohan',
            'email' => 'rohan@example.com',
            'password' => 'password',
            'created_at' => $createdAt,
        ]);

        $rohan = Profile::factory()->for($user)->owner()->create(['name' => 'Rohan', 'color' => '#7FD9B8', 'last_unlocked_at' => now()->subHour()]);
        $meera = Profile::factory()->for($user)->member()->create(['name' => 'Meera', 'color' => '#C7AFF5', 'last_unlocked_at' => now()->subDay()]);
        $arjun = Profile::factory()->for($user)->restricted()->create(['name' => 'Arjun', 'color' => '#82C7F0', 'web_mode' => 'never']);
        Profile::factory()->for($user)->guest()->create();

        $device = Device::factory()->for($user)->seenToday()->create(['name' => "Rohan's Pixel 8", 'app_version' => '1.1.0', 'created_at' => $createdAt]);
        $this->seedActivityDays($device, $createdAt, 0.9);

        $home = Place::factory()->for($user)->home()->create([
            'address' => '14 Rose Garden Road, Koramangala, Bengaluru',
            'lat' => self::HOME_LAT,
            'lng' => self::HOME_LNG,
        ]);

        $user->alertSettings->update([
            'speak_mode' => SpeakMode::Full,
            'quiet_start' => '22:30',
            'quiet_end' => '07:00',
            'urgent_keywords' => ['urgent', 'call me', 'hospital'],
        ]);

        $this->seedConversation($rohan, 'Dinner ideas for tonight', [
            'What can I cook tonight with paneer, spinach and rice?',
            'Palak paneer with jeera rice works well. Blanch the spinach, blend it, then simmer with onion, garlic, ginger and the paneer cubes for about ten minutes.',
            'How long does jeera rice take?',
            'About 20 minutes: toast cumin in ghee, add the washed rice and twice its volume of water, then cover and cook on low heat.',
        ], now()->subHours(3));
        $this->seedConversation($rohan, 'Weekend trip to Mysore', [
            'Is the Mysore palace open on Sunday?',
            'Yes, it is open every day from 10:00 to 17:30, and the lights are switched on on Sunday evenings.',
        ], now()->subDays(2), web: true);
        $this->seedConversation($meera, 'Science homework help', [
            'Explain photosynthesis in simple words.',
            'Plants use sunlight to turn water and carbon dioxide into sugar for food, and they release oxygen while doing it.',
        ], now()->subDay());

        $this->seedTodaysLocations($user, $device, $home);

        Reminder::factory()->for($rohan)->create(['title' => 'Pay the electricity bill', 'due_at' => now()->addDay()->setTime(10, 0)]);
        Reminder::factory()->for($rohan)->arriveHome()->create(['title' => 'Water the plants']);
        Reminder::factory()->for($rohan)->done()->create(['title' => 'Call the plumber', 'due_at' => now()->subDay()]);
        Reminder::factory()->for($meera)->create(['title' => 'Submit science project', 'due_at' => now()->addDays(3)->setTime(9, 0)]);

        $user->vipContacts()->create(['name' => 'Mom', 'match_key' => 'Mom', 'sources' => [MessageSource::Whatsapp->value, MessageSource::Sms->value], 'enabled' => true]);
        $user->vipContacts()->create(['name' => 'Neha', 'match_key' => 'Neha Sharma', 'sources' => [MessageSource::Whatsapp->value, MessageSource::GoogleChat->value], 'enabled' => true]);

        foreach ([
            [ActivityType::LeftHome, 'Left home', null, 9 * 60],
            [ActivityType::SpokenAlert, 'Read out a message from Mom', $rohan, 7 * 60],
            [ActivityType::ReminderFired, 'Reminder: Water the plants', $rohan, 60],
            [ActivityType::ArrivedHome, 'Arrived home', null, 50],
            [ActivityType::ReplySent, 'Sent a reply to Neha', $rohan, 20],
        ] as [$type, $summary, $profile, $minutesAgo]) {
            ActivityLog::factory()->for($user)->create([
                'profile_id' => $profile?->id,
                'device_id' => $device->id,
                'type' => $type->value,
                'summary' => $summary,
                'occurred_at' => now()->subMinutes($minutesAgo),
            ]);
        }

        $this->authEvent($user, AuthEventType::Register, $createdAt, device: $device);
        $this->authEvent($user, AuthEventType::Login, $createdAt, device: $device);
        $this->authEvent($user, AuthEventType::Unlock, now()->subHour(), $rohan, $device);
        $this->authEvent($user, AuthEventType::UnlockFailed, now()->subDay(), $arjun, $device);
        $this->authEvent($user, AuthEventType::Unlock, now()->subDay(), $meera, $device);
        $this->authEvent($user, AuthEventType::GuestSession, now()->subDays(3), device: $device);
    }

    private function seedRandomHousehold(CarbonImmutable $createdAt): void
    {
        $user = User::factory()->create(['created_at' => $createdAt, 'updated_at' => $createdAt]);

        $profiles = collect([Profile::factory()->for($user)->owner()->create(['name' => Str::before($user->name, ' '), 'created_at' => $createdAt])]);
        for ($n = fake()->numberBetween(0, 3); $n > 0; $n--) {
            $profiles->push(Profile::factory()->for($user)->state(['role' => fake()->randomElement(['member', 'member', 'restricted'])])->create(['created_at' => $createdAt]));
        }
        Profile::factory()->for($user)->guest()->create(['created_at' => $createdAt]);

        $devices = Device::factory()->for($user)->count(fake()->numberBetween(1, 2))->create(['created_at' => $createdAt]);
        foreach ($devices as $device) {
            $this->seedActivityDays($device, $createdAt, fake()->randomFloat(2, 0.1, 0.9));
        }

        if (fake()->boolean(70)) {
            Place::factory()->for($user)->home()->create();
        }

        foreach ($profiles as $profile) {
            foreach (range(1, fake()->numberBetween(1, 4)) as $ignored) {
                $this->seedRandomConversation($profile, $createdAt);
            }
        }

        $device = $devices->first();
        $this->authEvent($user, AuthEventType::Register, $createdAt, device: $device);
        foreach (range(1, fake()->numberBetween(2, 8)) as $ignored) {
            $this->authEvent(
                $user,
                fake()->randomElement([AuthEventType::Unlock, AuthEventType::Unlock, AuthEventType::Unlock, AuthEventType::UnlockFailed, AuthEventType::Login, AuthEventType::Lockout]),
                $this->between($createdAt),
                $profiles->random(),
                $device,
            );
        }

        foreach (range(1, fake()->numberBetween(0, 3)) as $ignored) {
            ActivityLog::factory()->for($user)->create([
                'device_id' => $device->id,
                'occurred_at' => $this->between($createdAt),
            ]);
        }
    }

    /**
     * @param  list<string>  $turns  user and assistant text, alternating, user first
     */
    private function seedConversation(Profile $profile, string $title, array $turns, \DateTimeInterface $at, bool $web = false): void
    {
        $at = CarbonImmutable::instance($at);
        $conversation = Conversation::factory()->for($profile)->create([
            'title' => $title,
            'created_at' => $at->subMinutes(count($turns)),
        ]);

        foreach ($turns as $i => $content) {
            $sentAt = $at->subMinutes(count($turns) - $i);
            $factory = ChatMessage::factory()->for($conversation);
            if ($i % 2 === 1) {
                $factory = $factory->assistant()->state([
                    'finish_reason' => 'stop',
                    'live' => $web,
                    'cited' => $web,
                    'sources' => $web ? [['n' => 1, 'title' => 'Mysore Palace', 'url' => 'https://mysorepalace.karnataka.gov.in']] : [],
                ]);
            }
            $factory->create(['content' => $content, 'sent_at' => $sentAt, 'created_at' => $sentAt]);
        }

        $conversation->update(['last_message_at' => $at]);
    }

    private function seedRandomConversation(Profile $profile, CarbonImmutable $since): void
    {
        $start = CarbonImmutable::instance($this->between($since));
        $conversation = Conversation::factory()->for($profile)->create(['created_at' => $start]);

        $count = fake()->numberBetween(1, 5) * 2;
        $sentAt = $start;
        for ($i = 0; $i < $count; $i++) {
            $sentAt = $sentAt->addSeconds(fake()->numberBetween(5, 300));
            $factory = ChatMessage::factory()->for($conversation);
            ($i % 2 === 1 ? $factory->assistant() : $factory)->create(['sent_at' => $sentAt, 'created_at' => $sentAt]);
        }

        $conversation->update(['last_message_at' => $sentAt]);
    }

    /**
     * Points every 15 minutes today up to 21:00: at home, a trip to the office and back.
     */
    private function seedTodaysLocations(User $user, Device $device, Place $home): void
    {
        $tz = config('aster.admin.timezone');
        $now = CarbonImmutable::now($tz);
        $office = [12.9716, 77.5946];

        for ($t = $now->startOfDay(); $t <= $now && $t->hour < 21; $t = $t->addMinutes(15)) {
            $minute = $t->hour * 60 + $t->minute;
            $atHome = $minute < 9 * 60 || $minute >= 18 * 60;
            $progress = $atHome ? 0 : min(1, ($minute - 9 * 60) / 60, (18 * 60 - $minute) / 60);
            $event = match ($minute) {
                9 * 60 => LocationEvent::Left,
                18 * 60 => LocationEvent::Arrived,
                default => LocationEvent::Periodic,
            };

            Location::factory()->for($user)->for($device)->create([
                'lat' => round(self::HOME_LAT + ($office[0] - self::HOME_LAT) * $progress + fake()->randomFloat(5, -0.0003, 0.0003), 7),
                'lng' => round(self::HOME_LNG + ($office[1] - self::HOME_LNG) * $progress + fake()->randomFloat(5, -0.0003, 0.0003), 7),
                'event' => $event,
                'place_id' => $atHome || $event !== LocationEvent::Periodic ? $home->id : null,
                'recorded_at' => $t->utc(),
            ]);
        }
    }

    private function seedActivityDays(Device $device, CarbonImmutable $since, float $chance): void
    {
        $tz = config('aster.admin.timezone');
        $today = CarbonImmutable::now($tz)->startOfDay();
        $rows = [];

        for ($day = $since->setTimezone($tz)->startOfDay(); $day <= $today; $day = $day->addDay()) {
            if ($day->equalTo($today) || fake()->boolean((int) round($chance * 100))) {
                $rows[] = ['user_id' => $device->user_id, 'device_id' => $device->id, 'day' => $day->toDateString()];
            }
        }

        DeviceActivityDay::insert($rows);
    }

    private function authEvent(User $user, AuthEventType $type, \DateTimeInterface $at, ?Profile $profile = null, ?Device $device = null): void
    {
        AuthEvent::factory()->create([
            'user_id' => $user->id,
            'profile_id' => in_array($type, [AuthEventType::Register, AuthEventType::Login, AuthEventType::Logout], true) ? null : $profile?->id,
            'device_id' => $device?->id,
            'type' => $type,
            'created_at' => $at,
        ]);
    }

    private function between(CarbonImmutable $since): \DateTime
    {
        return fake()->dateTimeBetween($since, 'now');
    }
}
