<?php

use App\Enums\LocationEvent;
use App\Filament\Resources\Households\Pages\ViewConversation;
use App\Filament\Resources\Households\Pages\ViewHousehold;
use App\Filament\Resources\Households\RelationManagers\ActivityRelationManager;
use App\Filament\Resources\Households\RelationManagers\AlertsRelationManager;
use App\Filament\Resources\Households\RelationManagers\AuditRelationManager;
use App\Filament\Resources\Households\RelationManagers\ChatsRelationManager;
use App\Filament\Resources\Households\RelationManagers\DevicesRelationManager;
use App\Filament\Resources\Households\RelationManagers\LocationsRelationManager;
use App\Filament\Resources\Households\RelationManagers\ProfilesRelationManager;
use App\Filament\Resources\Households\RelationManagers\RemindersRelationManager;
use App\Filament\Resources\Households\RelationManagers\SecurityRelationManager;
use App\Models\ActivityLog;
use App\Models\Admin;
use App\Models\AdminAuditLog;
use App\Models\AuthEvent;
use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\Device;
use App\Models\Location;
use App\Models\Place;
use App\Models\Profile;
use App\Models\Reminder;
use App\Models\User;
use App\Models\VipContact;
use App\Services\AdminAudit;
use Filament\Facades\Filament;
use Laravel\Sanctum\PersonalAccessToken;
use Livewire\Features\SupportLockedProperties\CannotUpdateLockedPropertyException;
use Livewire\Features\SupportTesting\Testable;
use Livewire\Livewire;

/**
 * A household with a row of every kind, each marked with $tag so a page can
 * be checked for another household's rows.
 *
 * @return array{household: User, owner: Profile, device: Device, conversation: Conversation}
 */
function fullHousehold(string $tag): array
{
    $household = User::factory()->create(['name' => "Owner {$tag}", 'email' => "{$tag}@example.com", 'password' => 'secret-pass']);
    $owner = Profile::factory()->owner()->for($household)->create(['name' => "Owner {$tag}"]);
    Profile::factory()->member()->for($household)->create(['name' => "Member {$tag}"]);
    Profile::factory()->guest()->for($household)->create();
    $device = Device::factory()->for($household)->seenToday()->create(['name' => "Phone {$tag}"]);
    Place::factory()->home()->for($household)->create(['address' => "1 {$tag} Road"]);

    $conversation = Conversation::factory()->for($owner)->create(['title' => "Chat {$tag}", 'last_message_at' => now()]);
    ChatMessage::factory()->for($conversation)->create(['content' => "Question text {$tag}"]);
    ChatMessage::factory()->assistant()->for($conversation)->create([
        'content' => "Answer text {$tag}",
        'rating' => 'good',
        'sources' => [['n' => 1, 'title' => "Source {$tag}", 'url' => 'https://example.com/'.$tag]],
    ]);

    Reminder::factory()->for($owner)->create(['title' => "Reminder {$tag}"]);
    VipContact::factory()->for($household)->create(['name' => "VIP {$tag}"]);
    ActivityLog::factory()->for($household)->create(['summary' => "Activity {$tag}", 'device_id' => $device->id]);
    AuthEvent::factory()->for($household)->create(['ip' => '203.0.113.'.strlen($tag), 'device_id' => $device->id]);

    return compact('household', 'owner', 'device', 'conversation');
}

/**
 * @param  class-string  $manager
 */
function tab(string $manager, User $household): Testable
{
    return Livewire::test($manager, ['ownerRecord' => $household, 'pageClass' => ViewHousehold::class]);
}

beforeEach(function () {
    Filament::setCurrentPanel('admin');
    $this->admin = Admin::factory()->withMfa()->create();
    $this->actingAs($this->admin, 'admin');

    ['household' => $this->household, 'owner' => $this->owner, 'device' => $this->device, 'conversation' => $this->conversation] = fullHousehold('alpha');
    ['household' => $this->other, 'conversation' => $this->otherConversation] = fullHousehold('bravo');
});

it('shows the overview with the household id, home and counts', function () {
    $this->get("/admin/households/{$this->household->id}")
        ->assertOk()
        ->assertSee('h'.$this->household->id)
        ->assertSee('alpha@example.com')
        ->assertSee('1 alpha Road')
        ->assertSee('ZYPHER_HOUSEHOLD_ID')
        ->assertDontSee('bravo');
});

it('shows only this household\'s rows on every tab', function () {
    tab(ProfilesRelationManager::class, $this->household)
        ->assertCanSeeTableRecords($this->household->profiles)
        ->assertCanNotSeeTableRecords($this->other->profiles);
    tab(DevicesRelationManager::class, $this->household)
        ->assertCanSeeTableRecords([$this->device])
        ->assertCanNotSeeTableRecords($this->other->devices);
    tab(ChatsRelationManager::class, $this->household)
        ->assertCanSeeTableRecords([$this->conversation])
        ->assertCanNotSeeTableRecords([$this->otherConversation]);
    tab(RemindersRelationManager::class, $this->household)
        ->assertSee('Reminder alpha')->assertDontSee('Reminder bravo');
    tab(AlertsRelationManager::class, $this->household)
        ->assertSee('VIP alpha')->assertDontSee('VIP bravo');
    tab(ActivityRelationManager::class, $this->household)
        ->assertSee('Activity alpha')->assertDontSee('Activity bravo');
    tab(SecurityRelationManager::class, $this->household)
        ->assertCanSeeTableRecords($this->household->authEvents)
        ->assertCanNotSeeTableRecords($this->other->authEvents);

    AdminAudit::record(AdminAudit::DEVICE_REVOKED, $this->household, $this->device);
    AdminAudit::record(AdminAudit::DEVICE_REVOKED, $this->other, $this->other->devices->first());
    tab(AuditRelationManager::class, $this->household)
        ->assertCanSeeTableRecords($this->household->auditLogs)
        ->assertCanNotSeeTableRecords($this->other->auditLogs);
});

it('lists deleted profiles and chats with their deleted state', function () {
    $gone = Profile::factory()->member()->for($this->household)->create(['name' => 'Gone member']);
    $goneChat = Conversation::factory()->for($gone)->create(['title' => 'Gone chat']);
    $gone->delete();
    $this->conversation->delete();

    tab(ProfilesRelationManager::class, $this->household)->assertCanSeeTableRecords([$gone]);
    tab(ChatsRelationManager::class, $this->household)->assertCanSeeTableRecords([$goneChat, $this->conversation]);
});

describe('chats', function () {
    it('keeps message text out of the page until Show messages, which writes one audit entry', function () {
        $page = Livewire::test(ViewConversation::class, ['record' => $this->household->id, 'chat' => $this->conversation->id])
            ->assertOk()
            ->assertSee('Chat alpha')
            ->assertSee('1 good, 0 bad')
            ->assertDontSee('Question text alpha')
            ->assertDontSee('Answer text alpha')
            ->assertDontSee('Source alpha');

        expect(AdminAuditLog::count())->toBe(0);

        $page->callAction('showMessages')
            ->assertSee('Question text alpha')
            ->assertSee('Answer text alpha')
            ->assertSee('Source alpha')
            ->assertDontSee('bravo');

        $entry = AdminAuditLog::sole();
        expect($entry->action)->toBe('messages.viewed')
            ->and($entry->admin_id)->toBe($this->admin->id)
            ->and($entry->user_id)->toBe($this->household->id)
            ->and($entry->subject_id)->toBe($this->conversation->id)
            ->and($entry->meta)->toBe(['conversation_id' => $this->conversation->id]);
    });

    it('serves the conversation page with no message text in the HTML', function () {
        $this->get("/admin/households/{$this->household->id}/chats/{$this->conversation->id}")
            ->assertOk()
            ->assertSee('Show messages')
            ->assertDontSee('Question text alpha')
            ->assertDontSee('Answer text alpha');
    });

    it('404s another household\'s conversation', function () {
        $this->get("/admin/households/{$this->household->id}/chats/{$this->otherConversation->id}")->assertNotFound();
    });

    it('won\'t let the browser reveal messages without the action', function () {
        Livewire::test(ViewConversation::class, ['record' => $this->household->id, 'chat' => $this->conversation->id])
            ->set('revealed', true);
    })->throws(CannotUpdateLockedPropertyException::class);
});

describe('locations', function () {
    beforeEach(function () {
        config(['aster.admin.timezone' => 'Asia/Kolkata']);
        $this->travelTo('2026-09-20 12:00:00');

        // 18:00 UTC on the 18th is 23:30 on the 18th in Asia/Kolkata; 19:00 UTC is 00:30 on the 19th.
        $this->late = Location::factory()->for($this->device)->create(['lat' => 12.9716111, 'lng' => 77.5946222, 'recorded_at' => '2026-09-18 18:00:00', 'event' => LocationEvent::Arrived]);
        $this->next = Location::factory()->for($this->device)->create(['lat' => 12.9811333, 'lng' => 77.6012444, 'recorded_at' => '2026-09-18 19:00:00']);
        $otherDevice = $this->other->devices->first();
        Location::factory()->for($otherDevice)->create(['lat' => 13.1111111, 'lng' => 77.1111111, 'recorded_at' => '2026-09-18 18:10:00']);
    });

    it('keeps coordinates out of the page until Show locations, which writes one audit entry', function () {
        $tab = tab(LocationsRelationManager::class, $this->household)
            ->assertSee('Locations are hidden')
            ->assertCountTableRecords(0)
            ->assertDontSee('12.9716111')
            ->assertDontSee('77.5946222');

        expect($tab->instance()->mapPoints())->toBe([])
            ->and(AdminAuditLog::count())->toBe(0);

        $tab->callTableAction('showLocations', data: ['day' => '2026-09-18'])
            ->assertCanSeeTableRecords([$this->late])
            ->assertCanNotSeeTableRecords([$this->next])
            ->assertSee('12.9716111')
            ->assertSee('OpenStreetMap')
            ->assertDontSee('13.1111111');

        expect($tab->instance()->mapPoints())->toBe([
            ['lat' => 12.9716111, 'lng' => 77.5946222, 'event' => 'arrived', 'label' => '23:30 · arrived'],
        ]);

        $entry = AdminAuditLog::sole();
        expect($entry->action)->toBe('locations.viewed')
            ->and($entry->user_id)->toBe($this->household->id)
            ->and($entry->meta)->toBe(['date' => '2026-09-18']);
    });

    it('shows the next local day on its own', function () {
        tab(LocationsRelationManager::class, $this->household)
            ->callTableAction('showLocations', data: ['day' => '2026-09-19'])
            ->assertCanSeeTableRecords([$this->next])
            ->assertCanNotSeeTableRecords([$this->late]);
    });

    it('won\'t let the browser pick a day without the action', function () {
        tab(LocationsRelationManager::class, $this->household)->set('day', '2026-09-18');
    })->throws(CannotUpdateLockedPropertyException::class);
});

describe('suspend and revoke', function () {
    it('suspends: tokens go, the API refuses the household, and the reason is audited', function () {
        $phone = deviceToken($this->household, $this->device);
        $profile = profileToken($this->owner, $this->device);
        $otherPhone = deviceToken($this->other);

        Livewire::test(ViewHousehold::class, ['record' => $this->household->id])
            ->assertActionVisible('suspend')
            ->assertActionHidden('unsuspend')
            ->callAction('suspend', data: ['reason' => 'Abuse report #12'])
            ->assertHasNoActionErrors();

        $this->household->refresh();
        expect($this->household->suspended_at)->not->toBeNull()
            ->and($this->household->suspension_reason)->toBe('Abuse report #12')
            ->and($this->device->fresh()->signed_out_at)->not->toBeNull()
            ->and(PersonalAccessToken::count())->toBe(1);

        $this->withToken($phone)->getJson('/api/profiles')->assertUnauthorized();
        forgetAuth();
        $this->withToken($profile)->getJson('/api/me')->assertUnauthorized();
        forgetAuth();
        $this->postJson('/api/auth/login', ['email' => 'alpha@example.com', 'password' => 'secret-pass', 'device_name' => 'Pixel'])
            ->assertForbidden()
            ->assertExactJson(['message' => 'This account is suspended.']);
        forgetAuth();
        $this->withToken($otherPhone)->getJson('/api/profiles')->assertOk();

        $entry = AdminAuditLog::sole();
        expect($entry->action)->toBe('household.suspended')
            ->and($entry->user_id)->toBe($this->household->id)
            ->and($entry->meta)->toBe(['reason' => 'Abuse report #12']);
    });

    it('needs a reason to suspend', function () {
        Livewire::test(ViewHousehold::class, ['record' => $this->household->id])
            ->callAction('suspend', data: ['reason' => ''])
            ->assertHasActionErrors(['reason' => 'required']);

        expect($this->household->fresh()->isSuspended())->toBeFalse();
    });

    it('unsuspends and audits it', function () {
        $this->household->update(['suspended_at' => now(), 'suspension_reason' => 'Abuse']);

        Livewire::test(ViewHousehold::class, ['record' => $this->household->id])
            ->assertActionHidden('suspend')
            ->callAction('unsuspend');

        expect($this->household->fresh()->only(['suspended_at', 'suspension_reason']))->toBe(['suspended_at' => null, 'suspension_reason' => null])
            ->and(AdminAuditLog::sole()->action)->toBe('household.unsuspended');

        $this->postJson('/api/auth/login', ['email' => 'alpha@example.com', 'password' => 'secret-pass', 'device_name' => 'Pixel'])->assertOk();
    });

    it('revokes one device only', function () {
        $second = Device::factory()->for($this->household)->create();
        $revoked = [deviceToken($this->household, $this->device), profileToken($this->owner, $this->device)];
        $kept = [deviceToken($this->household, $second), profileToken($this->owner, $second)];

        tab(DevicesRelationManager::class, $this->household)
            ->assertTableActionHidden('revoke', Device::factory()->for($this->household)->signedOut()->create())
            ->callTableAction('revoke', $this->device);

        expect($this->device->fresh()->signed_out_at)->not->toBeNull()
            ->and($second->fresh()->signed_out_at)->toBeNull();

        foreach ($revoked as $token) {
            forgetAuth();
            $this->withToken($token)->getJson('/api/me')->assertUnauthorized();
        }
        forgetAuth();
        $this->withToken($kept[0])->getJson('/api/profiles')->assertOk();
        forgetAuth();
        $this->withToken($kept[1])->getJson('/api/me')->assertOk();

        $entry = AdminAuditLog::sole();
        expect($entry->action)->toBe('device.revoked')
            ->and($entry->subject_id)->toBe($this->device->id)
            ->and($entry->user_id)->toBe($this->household->id);
    });
});

it('never shows PIN hashes, token hashes or MFA secrets', function () {
    $token = $this->owner->createToken('device:'.$this->device->id, ['profile'])->accessToken;
    $secrets = [$this->owner->pin_hash, $token->token, $this->admin->getAppAuthenticationSecret()];

    $html = $this->get("/admin/households/{$this->household->id}")->getContent();
    foreach ([ProfilesRelationManager::class, DevicesRelationManager::class, ChatsRelationManager::class, RemindersRelationManager::class, LocationsRelationManager::class, AlertsRelationManager::class, ActivityRelationManager::class, SecurityRelationManager::class, AuditRelationManager::class] as $manager) {
        $html .= tab($manager, $this->household)->html();
    }
    $html .= Livewire::test(ViewConversation::class, ['record' => $this->household->id, 'chat' => $this->conversation->id])
        ->callAction('showMessages')
        ->html();

    foreach ($secrets as $secret) {
        expect($html)->not->toContain($secret);
    }
    expect($html)->not->toContain('pin_hash');
});
