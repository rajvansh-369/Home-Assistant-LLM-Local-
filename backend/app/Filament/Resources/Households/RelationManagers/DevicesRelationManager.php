<?php

namespace App\Filament\Resources\Households\RelationManagers;

use App\Filament\Resources\Devices\Tables\DevicesTable;
use App\Models\Device;
use App\Services\HouseholdAccess;
use Filament\Actions\Action;
use Filament\Notifications\Notification;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

/**
 * Devices tab (§6), with Revoke.
 */
class DevicesRelationManager extends RelationManager
{
    protected static string $relationship = 'devices';

    protected static ?string $title = 'Devices';

    public function table(Table $table): Table
    {
        return DevicesTable::configure($table, showHousehold: false)
            ->recordActions([
                Action::make('revoke')
                    ->icon(Heroicon::OutlinedNoSymbol)
                    ->color('danger')
                    ->requiresConfirmation()
                    ->modalHeading(fn (Device $record): string => "Revoke {$record->name}?")
                    ->modalDescription('Signs this phone out: its device token and every profile opened on it stop working at once. The home PC can keep answering it for up to 12 hours, until its llm_tokens expire.')
                    ->visible(fn (Device $record): bool => $record->signed_out_at === null)
                    ->action(function (Device $record): void {
                        HouseholdAccess::revoke($record);
                        Notification::make()->success()->title("{$record->name} is signed out.")->send();
                    }),
            ]);
    }
}
