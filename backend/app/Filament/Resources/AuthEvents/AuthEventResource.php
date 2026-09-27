<?php

namespace App\Filament\Resources\AuthEvents;

use App\Filament\Resources\AuthEvents\Pages\ListAuthEvents;
use App\Filament\Resources\AuthEvents\Tables\AuthEventsTable;
use App\Models\AuthEvent;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Model;

/**
 * Sign-ins, failed unlocks and lockouts across every household (§6, Navigation). Read-only.
 */
class AuthEventResource extends Resource
{
    protected static ?string $model = AuthEvent::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedLockClosed;

    protected static ?string $navigationLabel = 'Security';

    protected static ?string $modelLabel = 'security event';

    protected static ?string $pluralModelLabel = 'security';

    protected static ?string $slug = 'security';

    protected static ?int $navigationSort = 5;

    public static function table(Table $table): Table
    {
        return AuthEventsTable::configure($table);
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function canEdit(Model $record): bool
    {
        return false;
    }

    public static function canDelete(Model $record): bool
    {
        return false;
    }

    public static function canDeleteAny(): bool
    {
        return false;
    }

    public static function getPages(): array
    {
        return [
            'index' => ListAuthEvents::route('/'),
        ];
    }
}
