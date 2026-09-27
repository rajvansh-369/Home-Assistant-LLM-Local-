<?php

namespace App\Filament\Resources\Devices;

use App\Filament\Resources\Devices\Pages\ListDevices;
use App\Filament\Resources\Devices\Tables\DevicesTable;
use App\Models\Device;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Model;

/**
 * Every household's phones (§6, Navigation). Read-only; Revoke is on the household page.
 */
class DeviceResource extends Resource
{
    protected static ?string $model = Device::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedDevicePhoneMobile;

    protected static ?string $slug = 'devices';

    protected static ?int $navigationSort = 3;

    public static function table(Table $table): Table
    {
        return DevicesTable::configure($table);
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
            'index' => ListDevices::route('/'),
        ];
    }
}
