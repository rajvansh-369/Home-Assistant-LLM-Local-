<?php

namespace App\Filament\Resources\Households\RelationManagers;

use App\Models\AlertSetting;
use App\Models\User;
use App\Models\VipContact;
use App\Support\AdminDay;
use Filament\Infolists\Components\IconEntry;
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Schemas\Components\EmbeddedTable;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Alerts tab (§6): the alert settings, then the VIP contacts.
 */
class AlertsRelationManager extends RelationManager
{
    protected static string $relationship = 'vipContacts';

    protected static ?string $title = 'Alerts';

    public function content(Schema $schema): Schema
    {
        $settings = fn (): ?AlertSetting => $this->household()->alertSettings;

        return $schema
            ->components([
                Section::make('Alert settings')
                    ->columns(4)
                    ->schema([
                        IconEntry::make('enabled')->label('On')->boolean()->state(fn (): bool => (bool) $settings()?->enabled),
                        TextEntry::make('missed_after_minutes')->label('Missed after')->suffix(' min')->state(fn (): ?int => $settings()?->missed_after_minutes),
                        TextEntry::make('speak_mode')->label('Speaks')->state(fn (): ?string => $settings()?->speak_mode->value),
                        TextEntry::make('quiet_hours')
                            ->label('Quiet hours')
                            ->state(fn (): ?string => $settings()?->quiet_start === null ? null
                                : substr((string) $settings()->quiet_start, 0, 5).'–'.substr((string) $settings()->quiet_end, 0, 5))
                            ->placeholder('None'),
                        TextEntry::make('urgent_keywords')
                            ->label('Urgent keywords')
                            ->state(fn (): array => $settings()->urgent_keywords ?? [])
                            ->badge()
                            ->placeholder('None')
                            ->columnSpan(2),
                        IconEntry::make('headphones_only')->label('Headphones only')->boolean()->state(fn (): bool => (bool) $settings()?->headphones_only),
                        IconEntry::make('only_at_home')->label('Only at home')->boolean()->state(fn (): bool => (bool) $settings()?->only_at_home),
                    ]),
                EmbeddedTable::make(),
            ]);
    }

    /**
     * Deleted VIP contacts too.
     *
     * @return HasMany<VipContact, User>
     */
    public function getRelationship(): HasMany
    {
        return $this->household()->vipContacts()->withTrashed();
    }

    public function table(Table $table): Table
    {
        return $table
            ->heading('VIP contacts')
            ->columns([
                TextColumn::make('name'),
                TextColumn::make('match_key')->label('Matches sender'),
                TextColumn::make('sources')->badge(),
                IconColumn::make('enabled')->boolean(),
                TextColumn::make('deleted_at')->label('Deleted')->dateTime('d M Y', AdminDay::timezone())->placeholder('—'),
            ])
            ->defaultSort('name');
    }

    private function household(): User
    {
        /** @var User */
        return $this->getOwnerRecord();
    }
}
