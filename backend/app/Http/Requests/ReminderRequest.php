<?php

namespace App\Http\Requests;

use App\Enums\ReminderStatus;
use App\Enums\ReminderTrigger;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST needs client_uuid, title and trigger; PATCH and PUT change only what
 * they send. The controller checks that a time reminder ends up with a due_at.
 */
class ReminderRequest extends FormRequest
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
        $creating = $this->isMethod('post');
        $presence = $creating ? 'required' : 'sometimes';

        return [
            'client_uuid' => $creating ? ['required', 'uuid'] : ['prohibited'],
            'title' => [$presence, 'required', 'string', 'max:200'],
            'trigger' => [$presence, 'required', Rule::enum(ReminderTrigger::class)],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', 'required', Rule::enum(ReminderStatus::class)],
        ];
    }
}
