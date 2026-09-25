<?php

namespace App\Filament\Resources\Admins\Pages;

use App\Filament\Resources\Admins\AdminResource;
use Filament\Resources\Pages\ListRecords;

class ListAdmins extends ListRecords
{
    protected static string $resource = AdminResource::class;

    public function getSubheading(): ?string
    {
        return 'Add an admin with `php artisan aster:create-admin {email}` on the server.';
    }
}
