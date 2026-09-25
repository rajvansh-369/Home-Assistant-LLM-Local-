<?php

namespace App\Filament\Resources\Admins\Tables;

use App\Models\Admin;
use App\Services\AdminAudit;
use Filament\Actions\Action;
use Filament\Notifications\Notification;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Support\Facades\Auth;

class AdminsTable
{
    public static function configure(Table $table): Table
    {
        $tz = config('aster.admin.timezone');

        return $table
            ->columns([
                TextColumn::make('name')->searchable()->sortable(),
                TextColumn::make('email')->searchable()->sortable(),
                IconColumn::make('is_active')->label('Active')->boolean(),
                IconColumn::make('mfa')
                    ->label('Authenticator set up')
                    ->state(fn (Admin $record): bool => $record->hasMultiFactorSetUp())
                    ->boolean(),
                TextColumn::make('last_login_at')->label('Last sign-in')->dateTime('d M Y, H:i', $tz)->placeholder('Never')->sortable(),
                TextColumn::make('created_at')->dateTime('d M Y', $tz)->sortable(),
            ])
            ->defaultSort('name')
            ->recordActions([
                Action::make('deactivate')
                    ->icon(Heroicon::OutlinedNoSymbol)
                    ->color('danger')
                    ->requiresConfirmation()
                    ->modalDescription('They are signed out and can\'t sign in again until reactivated.')
                    ->visible(fn (Admin $record): bool => $record->is_active && ! self::isMe($record))
                    ->action(function (Admin $record): void {
                        if (self::isMe($record)) {
                            Notification::make()->danger()->title('You can\'t deactivate yourself.')->send();

                            return;
                        }

                        $record->update(['is_active' => false]);
                        AdminAudit::record(AdminAudit::ADMIN_DEACTIVATED, null, $record);
                        Notification::make()->success()->title("{$record->name} is deactivated.")->send();
                    }),
                Action::make('reactivate')
                    ->icon(Heroicon::OutlinedCheckCircle)
                    ->requiresConfirmation()
                    ->visible(fn (Admin $record): bool => ! $record->is_active)
                    ->action(function (Admin $record): void {
                        $record->update(['is_active' => true]);
                        AdminAudit::record(AdminAudit::ADMIN_REACTIVATED, null, $record);
                        Notification::make()->success()->title("{$record->name} is active again.")->send();
                    }),
            ]);
    }

    private static function isMe(Admin $record): bool
    {
        return $record->is(Auth::guard('admin')->user());
    }
}
