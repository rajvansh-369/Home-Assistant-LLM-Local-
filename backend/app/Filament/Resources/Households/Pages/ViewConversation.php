<?php

namespace App\Filament\Resources\Households\Pages;

use App\Enums\FinishReason;
use App\Enums\MessageRole;
use App\Enums\Rating;
use App\Filament\Resources\Households\HouseholdResource;
use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\User;
use App\Services\AdminAudit;
use App\Support\AdminDay;
use Filament\Actions\Action;
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\Pages\Concerns\InteractsWithRecord;
use Filament\Resources\Pages\Page;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Text;
use Filament\Schemas\Components\View;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Illuminate\Support\Collection;
use Livewire\Attributes\Locked;

/**
 * One conversation (§6, Chats): counts, ratings, answer time and web
 * answers. The message text stays out of the page until Show messages,
 * which writes messages.viewed with the conversation id.
 */
class ViewConversation extends Page
{
    use InteractsWithRecord;

    protected static string $resource = HouseholdResource::class;

    #[Locked]
    public Conversation $conversation;

    /** Only Show messages sets this, so the browser can't skip the audit entry. */
    #[Locked]
    public bool $revealed = false;

    /** @var array{messages: int, answers: int, good: int, bad: int, average_seconds: float|null, web: int, cut_off: int}|null */
    private ?array $stats = null;

    public function mount(int|string $record, int|string $chat): void
    {
        $this->record = $this->resolveRecord($record);

        abort_unless(static::getResource()::canView($this->getRecord()), 403);

        // Looked up through the household, so another household's id is 404.
        $this->conversation = $this->household()->conversations()
            ->withTrashedParents()
            ->withTrashed()
            ->findOrFail($chat);
    }

    public function getTitle(): string
    {
        return $this->conversation->title;
    }

    /**
     * @return array<string, string>
     */
    public function getBreadcrumbs(): array
    {
        return [
            HouseholdResource::getUrl() => 'Households',
            HouseholdResource::getUrl('view', ['record' => $this->household(), 'relation' => 'ChatsRelationManager']) => $this->household()->name.' · '.$this->household()->householdId(),
            'Chat',
        ];
    }

    protected function getHeaderActions(): array
    {
        return [
            Action::make('showMessages')
                ->label('Show messages')
                ->icon(Heroicon::OutlinedEye)
                ->color('warning')
                ->requiresConfirmation()
                ->modalHeading('Show this conversation\'s messages?')
                ->modalDescription('Reading a household\'s chat is written to the audit log with this conversation\'s id.')
                ->modalSubmitActionLabel('Show messages')
                ->visible(fn (): bool => ! $this->revealed && $this->stats()['messages'] > 0)
                ->action(function (): void {
                    AdminAudit::record(AdminAudit::MESSAGES_VIEWED, $this->household(), $this->conversation, [
                        'conversation_id' => $this->conversation->id,
                    ]);

                    $this->revealed = true;
                }),
            Action::make('hideMessages')
                ->label('Hide messages')
                ->color('gray')
                ->visible(fn (): bool => $this->revealed)
                ->action(function (): void {
                    $this->revealed = false;
                }),
        ];
    }

    public function content(Schema $schema): Schema
    {
        $tz = AdminDay::timezone();
        $stats = fn (): array => $this->stats();

        return $schema
            ->components([
                Section::make('Conversation')
                    ->columns(4)
                    ->schema([
                        TextEntry::make('profile')->state(fn (): ?string => $this->conversation->profile()->withTrashed()->value('name')),
                        TextEntry::make('created_at')->label('Started')->state(fn (): mixed => $this->conversation->created_at)->dateTime('d M Y, H:i', $tz),
                        TextEntry::make('last_message_at')->label('Last message')->state(fn (): mixed => $this->conversation->last_message_at)->dateTime('d M Y, H:i', $tz)->placeholder('—'),
                        TextEntry::make('deleted_at')
                            ->label('Deleted')
                            ->state(fn (): mixed => $this->conversation->deleted_at)
                            ->dateTime('d M Y, H:i', $tz)
                            ->helperText('Its messages were removed when it was deleted.')
                            ->visible(fn (): bool => $this->conversation->trashed()),
                    ]),
                Section::make('Answers')
                    ->columns(5)
                    ->schema([
                        TextEntry::make('messages')->state(fn (): string => $stats()['messages'].' ('.$stats()['answers'].' answers)'),
                        TextEntry::make('ratings')->label('Ratings')->state(fn (): string => "{$stats()['good']} good, {$stats()['bad']} bad"),
                        TextEntry::make('average_seconds')->label('Average answer time')->state(fn (): ?string => $stats()['average_seconds'] === null ? null : number_format($stats()['average_seconds'], 1).' s')->placeholder('—'),
                        TextEntry::make('web')->label('Web answers')->state(fn (): int => $stats()['web']),
                        TextEntry::make('cut_off')->label('Cut off')->state(fn (): int => $stats()['cut_off']),
                    ]),
                Section::make('Messages')
                    ->schema([
                        Text::make('The message text is hidden. Show messages reveals it and writes an entry to the audit log.')
                            ->visible(fn (): bool => ! $this->revealed && $stats()['messages'] > 0),
                        Text::make('No messages.')
                            ->visible(fn (): bool => $stats()['messages'] === 0),
                        View::make('filament.households.conversation-thread')
                            ->visible(fn (): bool => $this->revealed),
                    ]),
            ]);
    }

    /**
     * The thread, oldest first. Empty until Show messages.
     *
     * @return Collection<int, ChatMessage>
     */
    public function messages(): Collection
    {
        if (! $this->revealed) {
            return collect();
        }

        return $this->conversation->messages()->orderBy('sent_at')->orderBy('id')->get();
    }

    /**
     * Counts that never read the message text.
     *
     * @return array{messages: int, answers: int, good: int, bad: int, average_seconds: float|null, web: int, cut_off: int}
     */
    public function stats(): array
    {
        return $this->stats ??= $this->countMessages();
    }

    /**
     * @return array{messages: int, answers: int, good: int, bad: int, average_seconds: float|null, web: int, cut_off: int}
     */
    private function countMessages(): array
    {
        $rows = $this->conversation->messages()->get(['role', 'rating', 'seconds', 'sources', 'finish_reason']);
        $answers = $rows->where('role', MessageRole::Assistant);
        $seconds = $answers->pluck('seconds')->filter(fn ($value): bool => $value !== null)->map(fn ($value): float => (float) $value);

        return [
            'messages' => $rows->count(),
            'answers' => $answers->count(),
            'good' => $answers->where('rating', Rating::Good)->count(),
            'bad' => $answers->where('rating', Rating::Bad)->count(),
            'average_seconds' => $seconds->isEmpty() ? null : (float) $seconds->avg(),
            'web' => $answers->filter(fn (ChatMessage $message): bool => ! empty($message->sources))->count(),
            'cut_off' => $answers->where('finish_reason', FinishReason::Length)->count(),
        ];
    }

    private function household(): User
    {
        /** @var User */
        return $this->getRecord();
    }
}
