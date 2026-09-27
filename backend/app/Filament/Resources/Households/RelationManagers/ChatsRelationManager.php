<?php

namespace App\Filament\Resources\Households\RelationManagers;

use App\Filament\Resources\Households\HouseholdResource;
use App\Models\Conversation;
use App\Models\Profile;
use App\Models\User;
use App\Support\AdminDay;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

/**
 * Chats tab (§6): conversation metadata only. A conversation's messages
 * appear on its own page, behind an audited Show messages.
 */
class ChatsRelationManager extends RelationManager
{
    protected static string $relationship = 'conversations';

    protected static ?string $title = 'Chats';

    /**
     * Deleted chats, and deleted profiles' chats, too.
     *
     * @return HasManyThrough<Conversation, Profile, User>
     */
    public function getRelationship(): HasManyThrough
    {
        /** @var User $household */
        $household = $this->getOwnerRecord();

        return $household->conversations()->withTrashedParents()->withTrashed();
    }

    public function table(Table $table): Table
    {
        $tz = AdminDay::timezone();

        return $table
            ->modifyQueryUsing(fn (Builder $query) => $query
                ->with(['profile' => fn ($q) => $q->withTrashed()])
                ->withCount('messages'))
            ->columns([
                TextColumn::make('profile.name')->label('Profile'),
                TextColumn::make('title')->limit(60)->searchable(),
                TextColumn::make('messages_count')->label('Messages'),
                TextColumn::make('last_message_at')->label('Last message')->dateTime('d M Y, H:i', $tz)->placeholder('—')->sortable(),
                TextColumn::make('deleted_at')->label('Deleted')->dateTime('d M Y', $tz)->placeholder('—'),
            ])
            ->defaultSort('last_message_at', 'desc')
            ->recordUrl(fn (Conversation $record): string => HouseholdResource::getUrl('conversation', [
                'record' => $this->getOwnerRecord(),
                'chat' => $record,
            ]));
    }
}
