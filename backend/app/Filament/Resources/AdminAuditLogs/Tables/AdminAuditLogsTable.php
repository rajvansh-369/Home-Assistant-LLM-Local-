<?php

namespace App\Filament\Resources\AdminAuditLogs\Tables;

use App\Models\Admin;
use App\Models\AdminAuditLog;
use App\Services\AdminAudit;
use Carbon\CarbonImmutable;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\TextInput;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\Filter;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

class AdminAuditLogsTable
{
    public static function configure(Table $table): Table
    {
        $tz = config('aster.admin.timezone');

        return $table
            ->modifyQueryUsing(fn (Builder $query) => $query->with('admin'))
            ->columns([
                TextColumn::make('created_at')->label('When')->dateTime('d M Y, H:i:s', $tz)->sortable(),
                TextColumn::make('admin.name')->label('Admin'),
                TextColumn::make('action')->badge()->color(fn (string $state): string => match (true) {
                    str_ends_with($state, '.viewed') => 'warning',
                    in_array($state, [AdminAudit::HOUSEHOLD_SUSPENDED, AdminAudit::DEVICE_REVOKED, AdminAudit::ADMIN_DEACTIVATED], true) => 'danger',
                    default => 'gray',
                }),
                TextColumn::make('user_id')->label('Household')->formatStateUsing(fn (?int $state): string => 'h'.$state)->placeholder('—'),
                TextColumn::make('subject')
                    ->state(fn (AdminAuditLog $record): ?string => $record->subject_type === null ? null : class_basename($record->subject_type).' #'.$record->subject_id)
                    ->placeholder('—'),
                TextColumn::make('meta')
                    ->state(fn (AdminAuditLog $record): ?string => $record->meta === null || $record->meta === [] ? null : json_encode($record->meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE))
                    ->limit(60)
                    ->placeholder('—'),
                TextColumn::make('ip')->label('IP address')->placeholder('—'),
                TextColumn::make('user_agent')->limit(40)->toggleable(isToggledHiddenByDefault: true),
            ])
            ->defaultSort('created_at', 'desc')
            ->filters([
                SelectFilter::make('admin_id')
                    ->label('Admin')
                    ->options(fn () => Admin::query()->orderBy('name')->pluck('name', 'id')->all()),
                SelectFilter::make('action')
                    ->options(array_combine(AdminAudit::ACTIONS, AdminAudit::ACTIONS)),
                Filter::make('household')
                    ->schema([TextInput::make('household')->label('Household id')->placeholder('h7')])
                    ->query(function (Builder $query, array $data): Builder {
                        $id = ltrim(strtolower(trim((string) ($data['household'] ?? ''))), 'h');

                        return ctype_digit($id) ? $query->where('user_id', (int) $id) : $query;
                    }),
                Filter::make('created_at')
                    ->label('Date')
                    ->schema([
                        DatePicker::make('from'),
                        DatePicker::make('until'),
                    ])
                    // Dates are days in ASTER_ADMIN_TIMEZONE; the column holds UTC.
                    ->query(fn (Builder $query, array $data): Builder => $query
                        ->when($data['from'] ?? null, fn (Builder $q, string $from) => $q->where('created_at', '>=', CarbonImmutable::parse($from, $tz)->startOfDay()->utc()))
                        ->when($data['until'] ?? null, fn (Builder $q, string $until) => $q->where('created_at', '<', CarbonImmutable::parse($until, $tz)->addDay()->startOfDay()->utc()))),
            ]);
    }
}
