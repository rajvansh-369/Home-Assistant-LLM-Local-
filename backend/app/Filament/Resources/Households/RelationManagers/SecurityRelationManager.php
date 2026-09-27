<?php

namespace App\Filament\Resources\Households\RelationManagers;

use App\Filament\Resources\AuthEvents\Tables\AuthEventsTable;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Table;

/**
 * Security tab (§6): the household's auth events, with IP addresses.
 */
class SecurityRelationManager extends RelationManager
{
    protected static string $relationship = 'authEvents';

    protected static ?string $title = 'Security';

    public function table(Table $table): Table
    {
        return AuthEventsTable::configure($table, showHousehold: false);
    }
}
