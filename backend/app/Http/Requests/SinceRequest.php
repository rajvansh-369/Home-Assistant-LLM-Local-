<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;

/**
 * A read that can ask only for what changed since a server_time the app
 * saved earlier (GET /sync, GET /conversations).
 */
class SinceRequest extends FormRequest
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
            'since' => ['nullable', 'date'],
            'cursor' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function since(): ?Carbon
    {
        $since = $this->validated('since');

        return $since === null ? null : Carbon::parse($since)->utc();
    }
}
