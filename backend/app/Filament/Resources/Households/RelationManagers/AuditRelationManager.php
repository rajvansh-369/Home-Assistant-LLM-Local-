<?php

namespace App\Filament\Resources\Households\RelationManagers;

use App\Filament\Resources\AdminAuditLogs\Tables\AdminAuditLogsTable;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Table;

/**
 * Audit tab (§6): audit entries about this household.
 */
class AuditRelationManager extends RelationManager
{
    protected static string $relationship = 'auditLogs';

    protected static ?string $title = 'Audit';

    public function table(Table $table): Table
    {
        return AdminAuditLogsTable::configure($table, showHousehold: false);
    }
}
