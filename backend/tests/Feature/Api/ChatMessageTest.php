<?php

use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\Device;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * One question and zypherLL's answer, as the phone uploads them.
 *
 * @return list<array<string, mixed>>
 */
function exchange(string $question = 'What is a KV cache?', string $sentAt = '2026-09-24T10:15:00Z'): array
{
    return [
        [
            'client_uuid' => (string) Str::uuid(),
            'role' => 'user',
            'content' => $question,
            'sent_at' => $sentAt,
            'context' => ['home', 'recent_messages'],
        ],
        [
            'client_uuid' => (string) Str::uuid(),
            'role' => 'assistant',
            'content' => 'A KV cache stores the attention keys and values of tokens already processed.',
            'sent_at' => $sentAt,
            'finish_reason' => 'stop',
            'memory_id' => 42,
            'live' => true,
            'cited' => true,
            'sources' => [['n' => 1, 'title' => 'Transformers docs', 'url' => 'https://example.com/kv']],
            'recalled' => 2,
            'sampling' => 'precise',
            'usage' => ['prompt_tokens' => 310, 'completion_tokens' => 42, 'total_tokens' => 352],
            'seconds' => 3.184,
        ],
    ];
}

beforeEach(function () {
    $this->household = User::factory()->create();
    $this->device = Device::factory()->for($this->household)->create();
    $this->owner = Profile::factory()->for($this->household)->owner()->create();
    $this->token = profileToken($this->owner, $this->device);
    $this->conversation = Conversation::factory()->for($this->owner)->create(['last_message_at' => null]);
    $this->url = "/api/conversations/{$this->conversation->id}/messages";
});

describe('store', function () {
    it('stores a batch and returns ids in request order', function () {
        $batch = exchange();

        $response = $this->withToken($this->token)->postJson($this->url, ['messages' => $batch]);

        $ids = ChatMessage::orderBy('id')->pluck('id', 'client_uuid');
        $response->assertOk()->assertExactJson(['data' => [
            ['id' => $ids[$batch[0]['client_uuid']], 'client_uuid' => $batch[0]['client_uuid']],
            ['id' => $ids[$batch[1]['client_uuid']], 'client_uuid' => $batch[1]['client_uuid']],
        ]]);

        $answer = ChatMessage::where('client_uuid', $batch[1]['client_uuid'])->sole();
        expect($answer->memory_id)->toBe(42)
            ->and($answer->sources)->toBe($batch[1]['sources'])
            ->and($answer->usage)->toBe($batch[1]['usage'])
            ->and((float) $answer->seconds)->toBe(3.18)
            ->and($this->conversation->fresh()->last_message_at->toIso8601ZuluString())->toBe('2026-09-24T10:15:00Z');
    });

    it('stores one row per client_uuid when the upload is retried', function () {
        $batch = exchange();

        $first = $this->withToken($this->token)->postJson($this->url, ['messages' => $batch])->json('data');
        $retry = $this->withToken($this->token)->postJson($this->url, ['messages' => $batch])->json('data');

        expect($retry)->toBe($first)->and(ChatMessage::count())->toBe(2);
    });

    it('never holds plain chat text in the database', function () {
        $this->withToken($this->token)->postJson($this->url, ['messages' => exchange('My secret recipe uses saffron')]);

        $raw = DB::table('chat_messages')->pluck('content')->implode(' ');

        expect($raw)->not->toContain('saffron')->not->toContain('KV cache');
    });

    it('moves last_message_at to the newest sent_at, never back', function () {
        $this->withToken($this->token)->postJson($this->url, ['messages' => exchange('New', '2026-09-24T12:00:00+05:30')]);
        expect($this->conversation->fresh()->last_message_at->toIso8601ZuluString())->toBe('2026-09-24T06:30:00Z');

        $this->withToken($this->token)->postJson($this->url, ['messages' => exchange('Old', '2026-09-23T08:00:00Z')]);
        expect($this->conversation->fresh()->last_message_at->toIso8601ZuluString())->toBe('2026-09-24T06:30:00Z');
    });

    it('refuses a client_uuid from another conversation', function () {
        $elsewhere = ChatMessage::factory()->create();
        $batch = exchange();
        $batch[1]['client_uuid'] = $elsewhere->client_uuid;

        $this->withToken($this->token)->postJson($this->url, ['messages' => $batch])
            ->assertUnprocessable()->assertJsonValidationErrors('messages.1.client_uuid');

        expect(ChatMessage::count())->toBe(1); // the transaction rolled back
    });

    it('validates batch size and values', function (Closure $mutate, string $error) {
        $this->withToken($this->token)->postJson($this->url, ['messages' => $mutate(exchange())])
            ->assertUnprocessable()->assertJsonValidationErrors($error);
    })->with([
        'empty batch' => [fn () => [], 'messages'],
        'over 50' => [fn ($b) => array_map(fn () => exchange()[0], range(1, 51)), 'messages'],
        'duplicate uuid' => [fn ($b) => [$b[0], $b[0]], 'messages.0.client_uuid'],
        'bad role' => [fn ($b) => [array_merge($b[0], ['role' => 'system'])], 'messages.0.role'],
        'content too long' => [fn ($b) => [array_merge($b[0], ['content' => str_repeat('a', 50001)])], 'messages.0.content'],
        'too many sources' => [fn ($b) => [array_merge($b[1], ['sources' => array_fill(0, 21, ['n' => 1, 'url' => 'https://x.test'])])], 'messages.0.sources'],
        'context with text' => [fn ($b) => [array_merge($b[0], ['context' => ['Mom said hi']])], 'messages.0.context.0'],
        'bad finish reason' => [fn ($b) => [array_merge($b[1], ['finish_reason' => 'done'])], 'messages.0.finish_reason'],
        'string memory id' => [fn ($b) => [array_merge($b[1], ['memory_id' => 'abc'])], 'messages.0.memory_id'],
    ]);

    it('answers 404 for another profile\'s conversation', function () {
        $theirs = Conversation::factory()->create();

        $this->withToken($this->token)->postJson("/api/conversations/{$theirs->id}/messages", ['messages' => exchange()])
            ->assertNotFound();
        expect(ChatMessage::count())->toBe(0);
    });
});

describe('index', function () {
    it('pages forward with after and limit', function () {
        $messages = ChatMessage::factory()->for($this->conversation)->count(5)->create();

        $page = $this->withToken($this->token)->getJson("{$this->url}?limit=2");
        $page->assertOk()->assertJsonPath('data.*.id', $messages->take(2)->pluck('id')->all())->assertJsonPath('meta.has_more', true);

        $last = $this->withToken($this->token)->getJson("{$this->url}?after={$messages[3]->id}&limit=2");
        $last->assertJsonPath('data.*.id', [$messages[4]->id])->assertJsonPath('meta.has_more', false);
    });

    it('returns the Message shape', function () {
        $this->withToken($this->token)->postJson($this->url, ['messages' => exchange()]);

        $this->withToken($this->token)->getJson($this->url)
            ->assertJsonPath('data.1.content', 'A KV cache stores the attention keys and values of tokens already processed.')
            ->assertJsonPath('data.1.sent_at', '2026-09-24T10:15:00Z')
            ->assertJsonPath('data.1.memory_id', 42)
            ->assertJsonPath('data.1.seconds', 3.18)
            ->assertJsonPath('data.0.context', ['home', 'recent_messages'])
            ->assertJsonPath('data.0.sources', [])
            ->assertJsonStructure(['data' => [['id', 'client_uuid', 'role', 'content', 'sent_at', 'finish_reason', 'memory_id', 'live', 'cited', 'sources', 'recalled', 'sampling', 'usage', 'seconds', 'rating', 'context', 'created_at']]]);
    });

    it('caps limit at 100', function () {
        $this->withToken($this->token)->getJson("{$this->url}?limit=101")->assertUnprocessable();
    });
});

describe('update', function () {
    it('rates an answer and replaces continued content', function () {
        $message = ChatMessage::factory()->for($this->conversation)->assistant()->create(['finish_reason' => 'length', 'rating' => null]);

        $this->withToken($this->token)->patchJson("/api/chat-messages/{$message->id}", [
            'rating' => 'good', 'content' => 'The whole answer.', 'finish_reason' => 'stop',
        ])->assertOk()
            ->assertJsonPath('data.rating', 'good')
            ->assertJsonPath('data.content', 'The whole answer.')
            ->assertJsonPath('data.finish_reason', 'stop');

        $this->withToken($this->token)->patchJson("/api/chat-messages/{$message->id}", ['rating' => null])
            ->assertJsonPath('data.rating', null);
    });

    it('answers 404 for another profile\'s message', function () {
        $theirs = ChatMessage::factory()->create();

        $this->withToken($this->token)->patchJson("/api/chat-messages/{$theirs->id}", ['rating' => 'bad'])->assertNotFound();
    });
});
