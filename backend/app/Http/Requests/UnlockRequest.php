<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Any string is accepted: a PIN in the wrong format simply counts as a wrong try.
 */
class UnlockRequest extends FormRequest
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
            'pin' => ['required', 'string', 'max:20'],
        ];
    }
}
