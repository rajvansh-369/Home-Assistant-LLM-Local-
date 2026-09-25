<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A profile edits itself. Role changes go through the Owner instead.
 */
class UpdateMeRequest extends FormRequest
{
    use ProfileFields;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<mixed>>
     */
    public function rules(): array
    {
        return array_merge($this->profileFieldRules(), [
            'current_pin' => ['required_with:pin', 'string'],
        ]);
    }
}
