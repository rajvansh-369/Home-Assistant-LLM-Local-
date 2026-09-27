<?php

namespace App\Filament\Resources\Households\Tables;

use App\Enums\ProfileRole;
use App\Models\User;
use App\Support\AdminDay;
use Filament\Forms\Components\DatePicker;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\Filter;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

/**
 * Every household (§6, Households list). Counts come from withCount and
 * withMax, so the page runs the same number of queries for any page size.
 */
class HouseholdsTable
{
    public static function configure(Table $table): Table
    {
        $tz = AdminDay::timezone();

        return $table
            ->modifyQueryUsing(fn (Builder $query) => $query
                ->withCount([
                    'profiles' => fn (Builder $q) => $q->where('role', '!=', ProfileRole::Guest->value),
                    'devices' => fn (Builder $q) => $q->whereNull('signed_out_at'),
                    'conversations as active_chats_count' => fn (Builder $q) => $q->where('conversations.last_message_at', '>=', now()->subDays(30)),
                ])
                ->withMax('devices', 'last_seen_at'))
            ->columns([
                TextColumn::make('id')
                    ->label('Household')
                    ->formatStateUsing(fn (int $state): string => 'h'.$state)
                    ->searchable(query: fn (Builder $query, string $search): Builder => preg_match('/^h?(\d+)$/i', trim($search), $m)
                        ? $query->whereKey((int) $m[1])
                        : $query->whereKey([])),
                TextColumn::make('name')->label('Owner')->searchable(),
                TextColumn::make('email')->searchable(),
                TextColumn::make('profiles_count')->label('Profiles'),
                TextColumn::make('devices_count')->label('Devices')->tooltip('Phones signed in now'),
                TextColumn::make('devices_max_last_seen_at')
                    ->label('Last active')
                    ->dateTime('d M Y, H:i', $tz)
                    ->placeholder('Never')
                    ->sortable(query: fn (Builder $query, string $direction): Builder => $query
                        ->orderBy('devices_max_last_seen_at', $direction)
                        ->orderBy('users.id', $direction)),
                TextColumn::make('active_chats_count')->label('Chats, 30 days')->tooltip('Conversations with a message in the last 30 days'),
                TextColumn::make('status')
                    ->state(fn (User $record): string => $record->isSuspended() ? 'Suspended' : 'Active')
                    ->badge()
                    ->color(fn (string $state): string => $state === 'Suspended' ? 'danger' : 'success'),
                TextColumn::make('created_at')->label('Created')->dateTime('d M Y', $tz)->sortable(),
            ])
            ->defaultSort('devices_max_last_seen_at', 'desc')
            ->filters([
                SelectFilter::make('status')
                    ->options(['active' => 'Active', 'suspended' => 'Suspended'])
                    ->query(fn (Builder $query, array $data): Builder => match ($data['value'] ?? null) {
                        'active' => $query->whereNull('suspended_at'),
                        'suspended' => $query->whereNotNull('suspended_at'),
                        default => $query,
                    }),
                SelectFilter::make('active')
                    ->label('Active in')
                    ->options(['7' => 'Last 7 days', '30' => 'Last 30 days'])
                    ->query(fn (Builder $query, array $data): Builder => filled($data['value'] ?? null)
                        ? $query->whereHas('devices', fn (Builder $q) => $q->where('last_seen_at', '>=', now()->subDays((int) $data['value'])))
                        : $query),
                Filter::make('created_at')
                    ->label('Created')
                    ->schema([
                        DatePicker::make('from')->label('Created from'),
                        DatePicker::make('until')->label('Created until'),
                    ])
                    ->query(fn (Builder $query, array $data): Builder => $query
                        ->when($data['from'] ?? null, fn (Builder $q, string $from) => $q->where('users.created_at', '>=', AdminDay::start($from)))
                        ->when($data['until'] ?? null, fn (Builder $q, string $until) => $q->where('users.created_at', '<', AdminDay::end($until)))),
            ]);
    }
}
