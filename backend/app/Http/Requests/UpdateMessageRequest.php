<?php

namespace App\Http\Requests;

use App\Enums\FinishReason;
use App\Enums\Rating;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Rate an answer, or replace its content after "continue" finished it.
 */
class UpdateMessageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<mixed>>
     */
    public function rules(): array
    {
        return [
            'rating' => ['sometimes', 'nullable', Rule::enum(Rating::class)],
            'content' => ['sometimes', 'nullable', 'string', 'max:'.MessageFields::MAX_CONTENT],
            'finish_reason' => ['sometimes', 'nullable', Rule::enum(FinishReason::class)],
        ];
    }
}
