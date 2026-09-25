<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Fields left out keep their value.
 */
class UpdateLocationSettingRequest extends FormRequest
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
            'interval_minutes' => ['sometimes', 'required', 'integer', 'between:15,120'],
            'retention_days' => ['sometimes', 'required', 'integer', 'between:1,90'],
            'share_area' => ['sometimes', 'required', 'boolean'],
            'paused_until' => ['sometimes', 'nullable', 'date'],
        ];
    }
}
