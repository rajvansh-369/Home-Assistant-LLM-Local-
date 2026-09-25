<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * One local day of the household's trail: ?date=2026-09-24&tz=Asia/Kolkata
 */
class LocationDayRequest extends FormRequest
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
            'date' => ['required', 'date_format:Y-m-d'],
            'tz' => ['nullable', 'string', 'timezone:all'],
        ];
    }
}
