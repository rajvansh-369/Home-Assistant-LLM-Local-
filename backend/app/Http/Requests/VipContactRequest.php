<?php

namespace App\Http\Requests;

use App\Enums\MessageSource;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST needs every field; PATCH and PUT change only what they send.
 */
class VipContactRequest extends FormRequest
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
        $presence = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'name' => [$presence, 'required', 'string', 'max:60'],
            'match_key' => [$presence, 'required', 'string', 'max:120'],
            'sources' => [$presence, 'required', 'array', 'min:1'],
            'sources.*' => ['distinct', Rule::enum(MessageSource::class)],
            'enabled' => ['sometimes', 'required', 'boolean'],
        ];
    }
}
