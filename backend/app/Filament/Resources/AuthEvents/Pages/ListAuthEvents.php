<?php

namespace App\Filament\Resources\AuthEvents\Pages;

use App\Filament\Resources\AuthEvents\AuthEventResource;
use Filament\Resources\Pages\ListRecords;

class ListAuthEvents extends ListRecords
{
    protected static string $resource = AuthEventResource::class;
}
