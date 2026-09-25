<?php

use App\Filament\Resources\AdminAuditLogs\Pages\ListAdminAuditLogs;
use App\Models\Admin;
use App\Models\AdminAuditLog;
use App\Models\Conversation;
use App\Models\User;
use App\Services\AdminAudit;
use Filament\Facades\Filament;
use Illuminate\Http\Request;
use Livewire\Livewire;

beforeEach(function () {
    Filament::setCurrentPanel('admin');
    $this->admin = Admin::factory()->withMfa()->create();
});

it('records the admin, action, household, subject, IP address and user agent', function () {
    $this->actingAs($this->admin, 'admin');
    $this->app->instance('request', Request::create('/admin', 'GET', server: [
        'REMOTE_ADDR' => '203.0.113.4', 'HTTP_USER_AGENT' => 'Mozilla/5.0 Firefox/130.0',
    ]));
    $household = User::factory()->create();
    $conversation = Conversation::factory()->create();

    $entry = AdminAudit::record(AdminAudit::MESSAGES_VIEWED, $household, $conversation, ['conversation_id' => $conversation->id]);

    expect($entry->fresh()->only(['admin_id', 'action', 'user_id', 'subject_type', 'subject_id', 'meta', 'ip', 'user_agent']))->toBe([
        'admin_id' => $this->admin->id,
        'action' => 'messages.viewed',
        'user_id' => $household->id,
        'subject_type' => Conversation::class,
        'subject_id' => $conversation->id,
        'meta' => ['conversation_id' => $conversation->id],
        'ip' => '203.0.113.4',
        'user_agent' => 'Mozilla/5.0 Firefox/130.0',
    ]);
});

it('needs a signed-in admin', function () {
    AdminAudit::record(AdminAudit::MESSAGES_VIEWED, null);
})->throws(LogicException::class);

describe('the audit log page', function () {
    beforeEach(function () {
        $this->actingAs($this->admin, 'admin');
        $this->household = User::factory()->create();
        $this->other = Admin::factory()->withMfa()->create();
        $this->viewed = AdminAuditLog::factory()->for($this->admin)->create(['action' => 'messages.viewed', 'user_id' => $this->household->id, 'created_at' => '2026-09-20 12:00:00']);
        $this->suspended = AdminAuditLog::factory()->for($this->other)->create(['action' => 'household.suspended', 'user_id' => $this->household->id, 'created_at' => '2026-09-22 12:00:00']);
        $this->elsewhere = AdminAuditLog::factory()->for($this->admin)->create(['action' => 'locations.viewed', 'created_at' => '2026-09-23 20:00:00']);
    });

    it('lists entries newest first', function () {
        Livewire::test(ListAdminAuditLogs::class)
            ->assertCanSeeTableRecords([$this->elsewhere, $this->suspended, $this->viewed], inOrder: true);
    });

    it('filters by admin, action, household and date', function () {
        Livewire::test(ListAdminAuditLogs::class)
            ->filterTable('admin_id', $this->other->id)
            ->assertCanSeeTableRecords([$this->suspended])
            ->assertCanNotSeeTableRecords([$this->viewed, $this->elsewhere]);

        Livewire::test(ListAdminAuditLogs::class)
            ->filterTable('action', 'messages.viewed')
            ->assertCanSeeTableRecords([$this->viewed])
            ->assertCanNotSeeTableRecords([$this->suspended, $this->elsewhere]);

        Livewire::test(ListAdminAuditLogs::class)
            ->filterTable('household', ['household' => 'h'.$this->household->id])
            ->assertCanSeeTableRecords([$this->viewed, $this->suspended])
            ->assertCanNotSeeTableRecords([$this->elsewhere]);

        // 23 Sep 20:00 UTC is 24 Sep 01:30 in Kolkata.
        Livewire::test(ListAdminAuditLogs::class)
            ->filterTable('created_at', ['from' => '2026-09-24', 'until' => '2026-09-24'])
            ->assertCanSeeTableRecords([$this->elsewhere])
            ->assertCanNotSeeTableRecords([$this->viewed, $this->suspended]);
    });

    it('has no create, edit or delete actions', function () {
        Livewire::test(ListAdminAuditLogs::class)
            ->assertTableActionDoesNotExist('edit')
            ->assertTableActionDoesNotExist('delete')
            ->assertTableBulkActionDoesNotExist('delete')
            ->assertActionDoesNotExist('create');

        $this->get('/admin/audit-log/create')->assertNotFound();
        $this->get("/admin/audit-log/{$this->viewed->id}/edit")->assertNotFound();
    });
});
