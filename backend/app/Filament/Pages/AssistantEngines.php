<?php

namespace App\Filament\Pages;

use App\Enums\LlmEngine;
use App\Services\AdminAudit;
use App\Support\EngineNames;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Filament\Schemas\Components\Actions;
use Filament\Schemas\Components\EmbeddedSchema;
use Filament\Schemas\Components\Form;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;

/**
 * The names the app shows for the assistant engines. Each profile picks
 * Local (Zephyr on the home PC) or Mark-L (Gemini) in the app; this page
 * renames Mark-L for every household. The app gets the name at unlock and
 * sends it to zypherLL, so the assistant also introduces itself by it.
 *
 * @property-read Schema $form
 */
class AssistantEngines extends Page
{
    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedCpuChip;

    protected static ?int $navigationSort = 8;

    protected static ?string $slug = 'assistant-engines';

    protected static ?string $title = 'Assistant engines';

    /** @var array<string, mixed>|null */
    public ?array $data = [];

    public function mount(): void
    {
        $this->form->fill(['markl_name' => EngineNames::of(LlmEngine::Markl)]);
    }

    public function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('markl_name')
                    ->label('Mark-L name')
                    ->helperText('What the app calls the Mark-L engine, next to "'.EngineNames::of(LlmEngine::Local).'". Profiles pick one in the app.')
                    ->required()
                    ->maxLength(40),
            ])
            ->statePath('data');
    }

    public function content(Schema $schema): Schema
    {
        return $schema
            ->components([
                Form::make([EmbeddedSchema::make('form')])
                    ->id('form')
                    ->livewireSubmitHandler('save')
                    ->footer([
                        Actions::make([
                            Action::make('save')->label('Save')->submit('save'),
                        ]),
                    ]),
            ]);
    }

    public function save(): void
    {
        $name = trim((string) $this->form->getState()['markl_name']);
        $old = EngineNames::of(LlmEngine::Markl);

        if ($name !== $old) {
            EngineNames::rename(LlmEngine::Markl, $name);

            AdminAudit::record(AdminAudit::ENGINE_RENAMED, null, meta: [
                'engine' => LlmEngine::Markl->value,
                'from' => $old,
                'to' => $name,
            ]);
        }

        Notification::make()->success()->title('Saved')->send();
    }
}
