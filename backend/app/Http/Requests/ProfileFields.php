<?php

namespace App\Http\Requests;

use App\Enums\LlmEngine;
use App\Enums\Sampling;
use App\Enums\WebMode;
use Illuminate\Validation\Rule;

/**
 * The value rules for profile fields in docs/aster-backend-plan.md §5,
 * shared by POST /profiles, PATCH /profiles/{id} and PATCH /me.
 */
trait ProfileFields
{
    public const PIN_RULE = 'regex:/^\d{6}$/';

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('color'))) {
            $this->merge(['color' => strtoupper(trim($this->input('color')))]);
        }
    }

    /**
     * @return array<string, array<mixed>>
     */
    protected function profileFieldRules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:40'],
            'color' => ['sometimes', 'required', 'string', 'regex:/^#[0-9A-F]{6}$/'],
            'personality' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'web_mode' => ['sometimes', 'required', Rule::enum(WebMode::class)],
            'memory_enabled' => ['sometimes', 'required', 'boolean'],
            'sampling' => ['sometimes', 'required', Rule::enum(Sampling::class)],
            'llm_engine' => ['sometimes', 'required', Rule::enum(LlmEngine::class)],
            'max_tokens' => ['sometimes', 'nullable', 'integer', 'between:16,8192'],
            'auto_lock_minutes' => ['sometimes', 'nullable', 'integer', 'between:1,60'],
            'pin' => ['sometimes', 'required', 'string', self::PIN_RULE],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'pin.regex' => 'The PIN must be exactly 6 digits.',
            'color.regex' => 'The colour must be a hex colour like #7FD9B8.',
        ];
    }
}
