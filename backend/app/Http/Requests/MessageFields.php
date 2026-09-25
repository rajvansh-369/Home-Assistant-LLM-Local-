<?php

namespace App\Http\Requests;

use App\Enums\FinishReason;
use App\Enums\MessageRole;
use App\Enums\Rating;
use App\Enums\Sampling;
use Illuminate\Validation\Rule;

/**
 * Value rules for a chat message (§5), mirroring zypherLL's chat response:
 * finish_reason, usage, and the "zypher" meta (sampling, live, sources,
 * cited, recalled, memory_id, seconds).
 */
class MessageFields
{
    public const MAX_CONTENT = 50000;

    /**
     * @return array<string, array<mixed>>
     */
    public static function rules(string $prefix): array
    {
        return [
            $prefix.'client_uuid' => ['required', 'uuid'],
            $prefix.'role' => ['required', Rule::enum(MessageRole::class)],
            $prefix.'content' => ['present', 'nullable', 'string', 'max:'.self::MAX_CONTENT],
            $prefix.'sent_at' => ['required', 'date'],
            $prefix.'finish_reason' => ['nullable', Rule::enum(FinishReason::class)],
            $prefix.'memory_id' => ['nullable', 'integer', 'min:0'],
            $prefix.'live' => ['sometimes', 'boolean'],
            $prefix.'cited' => ['sometimes', 'boolean'],
            $prefix.'sources' => ['nullable', 'array', 'max:20'],
            $prefix.'sources.*' => ['array:n,title,url'],
            $prefix.'sources.*.n' => ['nullable', 'integer', 'min:0'],
            $prefix.'sources.*.title' => ['nullable', 'string', 'max:500'],
            $prefix.'sources.*.url' => ['required', 'string', 'max:2048'],
            $prefix.'recalled' => ['nullable', 'integer', 'min:0'],
            $prefix.'sampling' => ['nullable', Rule::enum(Sampling::class)],
            $prefix.'usage' => ['nullable', 'array:prompt_tokens,completion_tokens,total_tokens'],
            $prefix.'usage.*' => ['nullable', 'integer', 'min:0'],
            $prefix.'seconds' => ['nullable', 'numeric', 'between:0,999999'],
            $prefix.'rating' => ['nullable', Rule::enum(Rating::class)],
            // Flags naming what the app added to the prompt, never message text.
            $prefix.'context' => ['nullable', 'array', 'max:20'],
            $prefix.'context.*' => ['string', 'max:40', 'regex:/^[a-z0-9_.:-]+$/'],
        ];
    }
}
