<?php

use App\Enums\LlmEngine;
use App\Filament\Pages\AssistantEngines;
use App\Models\Admin;
use App\Models\AdminAuditLog;
use App\Support\EngineNames;
use Filament\Facades\Filament;
use Livewire\Livewire;

beforeEach(function () {
    Filament::setCurrentPanel('admin');
    $this->admin = Admin::factory()->withMfa()->create();
    $this->actingAs($this->admin, 'admin');
});

it('shows the current Mark-L name', function () {
    $this->get('/admin/assistant-engines')->assertOk()->assertSee('Mark-L name');

    Livewire::test(AssistantEngines::class)->assertSchemaStateSet(['markl_name' => 'Mark-L']);
});

it('renames Mark-L and audits it', function () {
    Livewire::test(AssistantEngines::class)
        ->fillForm(['markl_name' => '  Aster Pro '])
        ->call('save')
        ->assertHasNoFormErrors();

    expect(EngineNames::of(LlmEngine::Markl))->toBe('Aster Pro')
        ->and(AdminAuditLog::where('action', 'engine.renamed')->sole()->meta)
        ->toEqual(['engine' => 'markl', 'from' => 'Mark-L', 'to' => 'Aster Pro']);
});

it('does not audit a save that changes nothing', function () {
    Livewire::test(AssistantEngines::class)->call('save')->assertHasNoFormErrors();

    expect(AdminAuditLog::count())->toBe(0);
});

it('requires a name of at most 40 characters', function (string $name) {
    Livewire::test(AssistantEngines::class)
        ->fillForm(['markl_name' => $name])
        ->call('save')
        ->assertHasFormErrors(['markl_name']);

    expect(EngineNames::of(LlmEngine::Markl))->toBe('Mark-L');
})->with(['empty' => '', 'too long' => str_repeat('x', 41)]);
