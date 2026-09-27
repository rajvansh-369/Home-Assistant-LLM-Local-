<?php

namespace App\Filament\Resources\Devices\Tables;

use App\Filament\Tables\HouseholdColumns;
use App\Models\Device;
use App\Support\AdminDay;
use Carbon\CarbonImmutable;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

/**
 * Phones, one row per sign-in: across every household on the Devices page,
 * and one household's on its Devices tab.
 */
class DevicesTable
{
    /**
     * @param  bool  $showHousehold  false on a household page, where every row is that household's
     */
    public static function configure(Table $table, bool $showHousehold = true): Table
    {
        $tz = AdminDay::timezone();
        $since = CarbonImmutable::now($tz)->subDays(29)->toDateString();

        return $table
            ->modifyQueryUsing(fn (Builder $query) => $query->withCount([
                'activityDays as active_days_count' => fn (Builder $q) => $q->where('day', '>=', $since),
            ]))
            ->columns([
                HouseholdColumns::column()->visible($showHousehold),
                TextColumn::make('name')->searchable(),
                TextColumn::make('app_version')->label('App version')->placeholder('—'),
                TextColumn::make('last_seen_at')->label('Last seen')->dateTime('d M Y, H:i', $tz)->placeholder('Never')->sortable(),
                TextColumn::make('signed_out_at')->label('Signed out')->dateTime('d M Y, H:i', $tz)->placeholder('—')->sortable(),
                TextColumn::make('active_days_count')->label('Days active, 30 days'),
                TextColumn::make('created_at')->label('Signed in')->dateTime('d M Y, H:i', $tz)->sortable(),
            ])
            ->defaultSort('last_seen_at', 'desc')
            ->filters([
                SelectFilter::make('status')
                    ->options(['in' => 'Signed in', 'out' => 'Signed out'])
                    ->query(fn (Builder $query, array $data): Builder => match ($data['value'] ?? null) {
                        'in' => $query->whereNull('signed_out_at'),
                        'out' => $query->whereNotNull('signed_out_at'),
                        default => $query,
                    }),
                SelectFilter::make('app_version')
                    ->label('App version')
                    ->options(fn (): array => Device::query()->whereNotNull('app_version')->distinct()->orderBy('app_version')->pluck('app_version', 'app_version')->all()),
                ...($showHousehold ? [HouseholdColumns::filter()] : []),
            ]);
    }
}
