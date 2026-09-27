<?php

namespace App\Filament\Tables;

use App\Filament\Resources\Households\HouseholdResource;
use Filament\Forms\Components\TextInput;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\Filter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * The household column and filter shared by the tables that span every
 * household: devices, activity, security and the audit log.
 */
final class HouseholdColumns
{
    /**
     * "h7", linking to the household page.
     */
    public static function column(string $name = 'user_id'): TextColumn
    {
        return TextColumn::make($name)
            ->label('Household')
            ->formatStateUsing(fn (?int $state): string => 'h'.$state)
            ->url(fn (Model $record): ?string => $record->getAttribute($name) === null ? null
                : HouseholdResource::getUrl('view', ['record' => $record->getAttribute($name)]))
            ->placeholder('—');
    }

    /**
     * Filters by a typed household id, with or without the "h".
     */
    public static function filter(string $name = 'user_id'): Filter
    {
        return Filter::make('household')
            ->schema([TextInput::make('household')->label('Household id')->placeholder('h7')])
            ->query(function (Builder $query, array $data) use ($name): Builder {
                $id = ltrim(strtolower(trim((string) ($data['household'] ?? ''))), 'h');

                return ctype_digit($id) ? $query->where($query->qualifyColumn($name), (int) $id) : $query;
            });
    }
}
