@php
    /** @var \App\Filament\Resources\Households\Pages\ViewConversation $livewire */
    $livewire = $getLivewire();
    $tz = \App\Support\AdminDay::timezone();
@endphp

<style>
    .aster-thread { display: flex; flex-direction: column; gap: 1rem; margin: 0; padding: 0; list-style: none; }
    .aster-thread__message { border-radius: 0.5rem; padding: 1rem; border: 1px solid var(--gray-200); background: var(--gray-50); }
    .aster-thread__message--user { border-color: var(--primary-200); background: var(--primary-50); }
    .aster-thread__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.75rem; margin-bottom: 0.5rem; font-size: 0.75rem; color: var(--gray-500); }
    .aster-thread__who { font-weight: 600; color: var(--gray-950); }
    .aster-thread__text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 0.875rem; line-height: 1.5; color: var(--gray-950); }
    .aster-thread__sources { margin: 0.75rem 0 0; padding: 0; list-style: none; font-size: 0.75rem; color: var(--gray-500); }
    .aster-thread__sources a { color: var(--primary-600); text-decoration: underline; }
    :where(.dark) .aster-thread__message { border-color: var(--gray-700); background: var(--gray-900); }
    :where(.dark) .aster-thread__message--user { border-color: var(--primary-800); background: var(--gray-800); }
    :where(.dark) .aster-thread__who, :where(.dark) .aster-thread__text { color: var(--gray-50); }
    :where(.dark) .aster-thread__meta, :where(.dark) .aster-thread__sources { color: var(--gray-400); }
    :where(.dark) .aster-thread__sources a { color: var(--primary-400); }
</style>

<ol class="aster-thread">
    @foreach ($livewire->messages() as $message)
        @php($isAnswer = $message->role === \App\Enums\MessageRole::Assistant)

        <li @class(['aster-thread__message', 'aster-thread__message--user' => ! $isAnswer])>
            <div class="aster-thread__meta">
                <span class="aster-thread__who">{{ $isAnswer ? 'Assistant' : 'User' }}</span>
                <span>{{ $message->sent_at->setTimezone($tz)->format('d M Y, H:i:s') }}</span>

                @if ($isAnswer)
                    @if ($message->seconds !== null)
                        <span>{{ number_format((float) $message->seconds, 1) }} s</span>
                    @endif
                    @if ($message->finish_reason !== null && $message->finish_reason !== \App\Enums\FinishReason::Stop)
                        <x-filament::badge color="warning" size="sm">{{ $message->finish_reason->value }}</x-filament::badge>
                    @endif
                    @if ($message->rating !== null)
                        <x-filament::badge :color="$message->rating === \App\Enums\Rating::Good ? 'success' : 'danger'" size="sm">
                            {{ $message->rating === \App\Enums\Rating::Good ? 'Rated good' : 'Rated bad' }}
                        </x-filament::badge>
                    @endif
                @endif
            </div>

            <div class="aster-thread__text">{{ $message->content }}</div>

            @if (! empty($message->sources))
                <ul class="aster-thread__sources">
                    @foreach ($message->sources as $source)
                        @php($url = (string) ($source['url'] ?? ''))
                        <li>
                            [{{ $source['n'] ?? $loop->iteration }}]
                            @if (str_starts_with($url, 'https://') || str_starts_with($url, 'http://'))
                                <a href="{{ $url }}" target="_blank" rel="noopener noreferrer nofollow">{{ $source['title'] ?? $url }}</a>
                            @else
                                {{ $source['title'] ?? $url }}
                            @endif
                        </li>
                    @endforeach
                </ul>
            @endif
        </li>
    @endforeach
</ol>
