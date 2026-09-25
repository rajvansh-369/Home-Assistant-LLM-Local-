<?php

namespace App\Http\Requests;

use App\Enums\SpeakMode;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Fields left out keep their value.
 */
class UpdateAlertSettingRequest extends FormRequest
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
            'enabled' => ['sometimes', 'required', 'boolean'],
            'missed_after_minutes' => ['sometimes', 'required', 'integer', 'between:1,120'],
            'speak_mode' => ['sometimes', 'required', Rule::enum(SpeakMode::class)],
            'quiet_start' => ['sometimes', 'nullable', 'date_format:H:i'],
            'quiet_end' => ['sometimes', 'nullable', 'date_format:H:i'],
            'urgent_keywords' => ['sometimes', 'nullable', 'array', 'max:20'],
            'urgent_keywords.*' => ['string', 'max:40', 'distinct'],
            'headphones_only' => ['sometimes', 'required', 'boolean'],
            'only_at_home' => ['sometimes', 'required', 'boolean'],
        ];
    }
}
