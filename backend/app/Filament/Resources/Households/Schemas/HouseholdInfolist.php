<?php

namespace App\Filament\Resources\Households\Schemas;

use App\Enums\ProfileRole;
use App\Models\ChatMessage;
use App\Models\User;
use App\Support\AdminDay;
use Filament\Infolists\Components\TextEntry;
use Filament\Infolists\Components\ViewEntry;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Text;
use Filament\Schemas\Schema;
use Filament\Support\Enums\FontFamily;

/**
 * The Overview tab (§6): the account, the home place on a small map,
 * counts and the last activity.
 */
class HouseholdInfolist
{
    public static function configure(Schema $schema): Schema
    {
        $tz = AdminDay::timezone();

        return $schema
            ->columns(2)
            ->components([
                Section::make('Account')
                    ->columns(2)
                    ->schema([
                        TextEntry::make('household_id')
                            ->label('Household id')
                            ->state(fn (User $record): string => $record->householdId())
                            ->fontFamily(FontFamily::Mono)
                            ->copyable()
                            ->helperText('ZYPHER_HOUSEHOLD_ID in the home PC\'s .env'),
                        TextEntry::make('status')
                            ->state(fn (User $record): string => $record->isSuspended() ? 'Suspended' : 'Active')
                            ->badge()
                            ->color(fn (string $state): string => $state === 'Suspended' ? 'danger' : 'success'),
                        TextEntry::make('name')->label('Owner'),
                        TextEntry::make('email'),
                        TextEntry::make('created_at')->label('Created')->dateTime('d M Y, H:i', $tz),
                        TextEntry::make('suspended_at')
                            ->label('Suspended since')
                            ->dateTime('d M Y, H:i', $tz)
                            ->visible(fn (User $record): bool => $record->isSuspended()),
                        TextEntry::make('suspension_reason')
                            ->label('Suspension reason')
                            ->columnSpanFull()
                            ->visible(fn (User $record): bool => $record->isSuspended()),
                    ]),
                Section::make('Home')
                    ->columns(2)
                    ->visible(fn (User $record): bool => $record->home !== null)
                    ->schema([
                        TextEntry::make('home.address')->label('Address')->columnSpanFull(),
                        TextEntry::make('home.radius_m')->label('Radius')->suffix(' m'),
                        TextEntry::make('home.wifi_ssid')->label('Wi-Fi name')->placeholder('—'),
                        TextEntry::make('home.llm_url')->label('LLM address')->placeholder('—')->columnSpanFull(),
                        ViewEntry::make('home_map')->hiddenLabel()->view('filament.households.home-map')->columnSpanFull(),
                    ]),
                Section::make('Home')
                    ->visible(fn (User $record): bool => $record->home === null)
                    ->schema([
                        Text::make('No home place yet. The Owner sets it in the app.'),
                    ]),
                Section::make('Counts')
                    ->columns(5)
                    ->schema([
                        TextEntry::make('profiles_total')
                            ->label('Profiles')
                            ->state(fn (User $record): int => $record->profiles()->where('role', '!=', ProfileRole::Guest->value)->count())
                            ->helperText('Guest not counted'),
                        TextEntry::make('devices_total')
                            ->label('Devices')
                            ->state(fn (User $record): int => $record->devices()->whereNull('signed_out_at')->count())
                            ->helperText('Signed in'),
                        TextEntry::make('chats_total')
                            ->label('Chats')
                            ->state(fn (User $record): int => $record->conversations()->count()),
                        TextEntry::make('messages_total')
                            ->label('Messages')
                            ->state(fn (User $record): int => ChatMessage::query()
                                ->whereIn('conversation_id', $record->conversations()->select('conversations.id'))
                                ->count()),
                        TextEntry::make('reminders_total')
                            ->label('Reminders')
                            ->state(fn (User $record): int => $record->reminders()->count()),
                    ]),
                Section::make('Last activity')
                    ->columns(2)
                    ->schema([
                        TextEntry::make('last_active')
                            ->label('Last active')
                            ->state(fn (User $record): mixed => $record->devices()->max('last_seen_at'))
                            ->dateTime('d M Y, H:i', $tz)
                            ->placeholder('Never'),
                        TextEntry::make('latest_activity')
                            ->label('Latest activity')
                            ->state(function (User $record) use ($tz): ?string {
                                $log = $record->activityLogs()->latest('occurred_at')->first();

                                return $log === null ? null
                                    : $log->occurred_at->setTimezone($tz)->format('d M Y, H:i').' · '.$log->type.' · '.$log->summary;
                            })
                            ->placeholder('None yet'),
                    ]),
            ]);
    }
}
