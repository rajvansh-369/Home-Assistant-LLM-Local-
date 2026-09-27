<?php

namespace App\Filament\Resources\Households;

use App\Filament\Resources\Households\Pages\ListHouseholds;
use App\Filament\Resources\Households\Pages\ViewConversation;
use App\Filament\Resources\Households\Pages\ViewHousehold;
use App\Filament\Resources\Households\RelationManagers\ActivityRelationManager;
use App\Filament\Resources\Households\RelationManagers\AlertsRelationManager;
use App\Filament\Resources\Households\RelationManagers\AuditRelationManager;
use App\Filament\Resources\Households\RelationManagers\ChatsRelationManager;
use App\Filament\Resources\Households\RelationManagers\DevicesRelationManager;
use App\Filament\Resources\Households\RelationManagers\LocationsRelationManager;
use App\Filament\Resources\Households\RelationManagers\ProfilesRelationManager;
use App\Filament\Resources\Households\RelationManagers\RemindersRelationManager;
use App\Filament\Resources\Households\RelationManagers\SecurityRelationManager;
use App\Filament\Resources\Households\Schemas\HouseholdInfolist;
use App\Filament\Resources\Households\Tables\HouseholdsTable;
use App\Models\User;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Model;

/**
 * Every household's details (§6, Households list and Household page).
 * Read-only apart from Suspend, Unsuspend and Revoke. Chat text and
 * location trails appear only behind an audited Show action.
 */
class HouseholdResource extends Resource
{
    protected static ?string $model = User::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedHome;

    protected static ?string $modelLabel = 'household';

    protected static ?string $slug = 'households';

    protected static ?string $recordTitleAttribute = 'name';

    protected static bool $isGloballySearchable = false;

    protected static ?int $navigationSort = 2;

    public static function infolist(Schema $schema): Schema
    {
        return HouseholdInfolist::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return HouseholdsTable::configure($table);
    }

    /**
     * The household page's tabs after Overview, in §6's order.
     */
    public static function getRelations(): array
    {
        return [
            ProfilesRelationManager::class,
            DevicesRelationManager::class,
            ChatsRelationManager::class,
            RemindersRelationManager::class,
            LocationsRelationManager::class,
            AlertsRelationManager::class,
            ActivityRelationManager::class,
            SecurityRelationManager::class,
            AuditRelationManager::class,
        ];
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
            'index' => ListHouseholds::route('/'),
            'view' => ViewHousehold::route('/{record}'),
            'conversation' => ViewConversation::route('/{record}/chats/{chat}'),
        ];
    }
}
