<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreMessagesRequest extends FormRequest
{
    public const MAX_BATCH = 50;

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
            'messages' => ['required', 'array', 'min:1', 'max:'.self::MAX_BATCH],
            'messages.*' => ['array'],
            ...MessageFields::rules('messages.*.'),
            'messages.*.client_uuid' => ['required', 'uuid', 'distinct'],
        ];
    }
}
