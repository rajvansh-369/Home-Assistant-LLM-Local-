<?php

namespace App\Filament\Resources\Households\RelationManagers;

use App\Models\Profile;
use App\Models\Reminder;
use App\Models\User;
use App\Support\AdminDay;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

/**
 * Reminders tab (§6), deleted ones included.
 */
class RemindersRelationManager extends RelationManager
{
    protected static string $relationship = 'reminders';

    protected static ?string $title = 'Reminders';

    /**
     * Deleted reminders, and deleted profiles' reminders, too.
     *
     * @return HasManyThrough<Reminder, Profile, User>
     */
    public function getRelationship(): HasManyThrough
    {
        /** @var User $household */
        $household = $this->getOwnerRecord();

        return $household->reminders()->withTrashedParents()->withTrashed();
    }

    public function table(Table $table): Table
    {
        $tz = AdminDay::timezone();

        return $table
            ->modifyQueryUsing(fn (Builder $query) => $query
                ->with(['profile' => fn ($q) => $q->withTrashed()]))
            ->columns([
                TextColumn::make('title')->limit(60),
                TextColumn::make('profile.name')->label('Profile'),
                TextColumn::make('trigger'),
                TextColumn::make('due_at')->label('Due')->dateTime('d M Y, H:i', $tz)->placeholder('—')->sortable(),
                TextColumn::make('status')->badge(),
                TextColumn::make('deleted_at')->label('Deleted')->dateTime('d M Y', $tz)->placeholder('—'),
            ])
            ->defaultSort('reminders.created_at', 'desc');
    }
}
