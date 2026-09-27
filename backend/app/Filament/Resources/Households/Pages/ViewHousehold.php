<?php

namespace App\Filament\Resources\Households\Pages;

use App\Filament\Resources\Households\HouseholdResource;
use App\Models\User;
use App\Services\HouseholdAccess;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ViewRecord;
use Filament\Support\Icons\Heroicon;

/**
 * The household page: Overview plus nine tabs (§6), and the Suspend and
 * Unsuspend actions.
 */
class ViewHousehold extends ViewRecord
{
    protected static string $resource = HouseholdResource::class;

    public function getTitle(): string
    {
        return $this->household()->name.' · '.$this->household()->householdId();
    }

    public function hasCombinedRelationManagerTabsWithContent(): bool
    {
        return true;
    }

    public function getContentTabLabel(): ?string
    {
        return 'Overview';
    }

    protected function getHeaderActions(): array
    {
        return [
            Action::make('suspend')
                ->icon(Heroicon::OutlinedNoSymbol)
                ->color('danger')
                ->visible(fn (): bool => ! $this->household()->isSuspended())
                ->modalHeading('Suspend this household?')
                ->modalDescription('Every phone is signed out at once, and the API answers the household with 403 until you unsuspend it. The home PC can keep answering for up to 12 hours: llm_tokens already issued stay valid until they expire, because zypherLL checks them offline.')
                ->schema([
                    Textarea::make('reason')->required()->maxLength(255)->helperText('Kept on the account and in the audit log.'),
                ])
                ->modalSubmitActionLabel('Suspend')
                ->action(function (array $data): void {
                    HouseholdAccess::suspend($this->household(), trim((string) $data['reason']));
                    Notification::make()->success()->title('Household suspended.')->send();
                }),
            Action::make('unsuspend')
                ->icon(Heroicon::OutlinedCheckCircle)
                ->visible(fn (): bool => $this->household()->isSuspended())
                ->requiresConfirmation()
                ->modalDescription('The household can use the app again. Each phone signs in again.')
                ->action(function (): void {
                    HouseholdAccess::unsuspend($this->household());
                    Notification::make()->success()->title('Household unsuspended.')->send();
                }),
        ];
    }

    private function household(): User
    {
        /** @var User */
        return $this->getRecord();
    }
}
