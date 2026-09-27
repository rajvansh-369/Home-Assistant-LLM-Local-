<?php

namespace App\Filament\Resources\Households\RelationManagers;

use App\Filament\Resources\ActivityLogs\Tables\ActivityLogsTable;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Table;

/**
 * Activity tab (§6): the household's activity log, newest first, with a type filter.
 */
class ActivityRelationManager extends RelationManager
{
    protected static string $relationship = 'activityLogs';

    protected static ?string $title = 'Activity';

    public function table(Table $table): Table
    {
        return ActivityLogsTable::configure($table, showHousehold: false);
    }
}
