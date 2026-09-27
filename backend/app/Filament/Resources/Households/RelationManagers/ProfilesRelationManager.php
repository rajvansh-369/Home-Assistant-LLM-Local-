<?php

namespace App\Filament\Resources\Households\RelationManagers;

use App\Models\Profile;
use App\Models\User;
use App\Support\AdminDay;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\ColorColumn;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Profiles tab (§6), deleted profiles included.
 */
class ProfilesRelationManager extends RelationManager
{
    protected static string $relationship = 'profiles';

    protected static ?string $title = 'Profiles';

    /**
     * Deleted profiles too.
     *
     * @return HasMany<Profile, User>
     */
    public function getRelationship(): HasMany
    {
        /** @var User $household */
        $household = $this->getOwnerRecord();

        return $household->profiles()->withTrashed();
    }

    public function table(Table $table): Table
    {
        $tz = AdminDay::timezone();

        return $table
            ->modifyQueryUsing(fn (Builder $query) => $query->withCount(['conversations', 'messages']))
            ->columns([
                ColorColumn::make('color')->label(''),
                TextColumn::make('name'),
                TextColumn::make('role')->badge(),
                TextColumn::make('web_mode')->label('Web'),
                IconColumn::make('memory_enabled')->label('Memory')->boolean(),
                TextColumn::make('sampling'),
                TextColumn::make('llm_engine')->label('Engine'),
                TextColumn::make('auto_lock_minutes')->label('Auto-lock')->suffix(' min')->placeholder('Off'),
                TextColumn::make('last_unlocked_at')->label('Last unlocked')->dateTime('d M Y, H:i', $tz)->placeholder('Never'),
                TextColumn::make('conversations_count')->label('Chats'),
                TextColumn::make('messages_count')->label('Messages'),
                TextColumn::make('deleted_at')->label('Deleted')->dateTime('d M Y', $tz)->placeholder('—'),
            ])
            ->defaultSort('id');
    }
}
