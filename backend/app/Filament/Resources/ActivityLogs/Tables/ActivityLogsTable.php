<?php

namespace App\Filament\Resources\ActivityLogs\Tables;

use App\Enums\ActivityType;
use App\Filament\Tables\HouseholdColumns;
use App\Models\ActivityLog;
use App\Support\AdminDay;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

/**
 * The activity log the phones send: across every household on the Activity
 * page, and one household's on its Activity tab.
 */
class ActivityLogsTable
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
                TextColumn::make('occurred_at')->label('When')->dateTime('d M Y, H:i', $tz)->sortable(),
                HouseholdColumns::column()->visible($showHousehold),
                TextColumn::make('profile.name')->label('Profile')->placeholder('—'),
                TextColumn::make('device.name')->label('Device')->placeholder('—'),
                TextColumn::make('type')
                    ->badge()
                    ->color(fn (string $state): string => $state === ActivityType::ServerProblem->value ? 'danger' : 'gray'),
                TextColumn::make('summary')->wrap(),
            ])
            ->defaultSort('occurred_at', 'desc')
            ->filters([
                SelectFilter::make('type')->options(fn (): array => self::types()),
                ...($showHousehold ? [HouseholdColumns::filter()] : []),
            ]);
    }

    /**
     * The known types plus any newer ones a phone has sent.
     *
     * @return array<string, string>
     */
    private static function types(): array
    {
        $types = collect(ActivityType::cases())->map(fn (ActivityType $type): string => $type->value)
            ->merge(ActivityLog::query()->distinct()->pluck('type'))
            ->unique()
            ->sort()
            ->values()
            ->all();

        return array_combine($types, $types);
    }
}
