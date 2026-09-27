<?php

namespace App\Filament\Resources\AuthEvents\Tables;

use App\Enums\AuthEventType;
use App\Filament\Tables\HouseholdColumns;
use App\Support\AdminDay;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

/**
 * Sign-ins, unlocks and lockouts the server recorded: across every household
 * on the Security page, and one household's on its Security tab.
 */
class AuthEventsTable
{
    /**
     * @param  bool  $showHousehold  false on a household page, where every row is that household's
     */
    public static function configure(Table $table, bool $showHousehold = true): Table
    {
        $tz = AdminDay::timezone();

        return $table
            ->modifyQueryUsing(fn (Builder $query) => $query->with(['profile', 'device']))
            ->columns([
                TextColumn::make('created_at')->label('When')->dateTime('d M Y, H:i:s', $tz)->sortable(),
                HouseholdColumns::column()->visible($showHousehold),
                TextColumn::make('type')
                    ->badge()
                    ->formatStateUsing(fn (AuthEventType $state): string => $state->value)
                    ->color(fn (AuthEventType $state): string => match ($state) {
                        AuthEventType::LoginFailed, AuthEventType::UnlockFailed => 'warning',
                        AuthEventType::Lockout => 'danger',
                        default => 'gray',
                    }),
                TextColumn::make('profile.name')->label('Profile')->placeholder('—'),
                TextColumn::make('device.name')->label('Device')->placeholder('—'),
                TextColumn::make('ip')->label('IP address')->placeholder('—'),
            ])
            ->defaultSort('created_at', 'desc')
            ->filters([
                SelectFilter::make('type')->options(collect(AuthEventType::cases())->mapWithKeys(fn (AuthEventType $type): array => [$type->value => $type->value])->all()),
                ...($showHousehold ? [HouseholdColumns::filter()] : []),
            ]);
    }
}
