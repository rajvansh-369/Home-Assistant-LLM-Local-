<?php

namespace App\Http\Requests;

use App\Models\Profile;
use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class StoreProfileRequest extends FormRequest
{
    use ProfileFields;

    /**
     * A device token may create the first profile; after that only the Owner (ProfilePolicy).
     */
    public function authorize(): Response
    {
        return Gate::inspect('create', Profile::class);
    }

    /**
     * @return array<string, array<mixed>>
     */
    public function rules(): array
    {
        return array_merge($this->profileFieldRules(), [
            'name' => ['required', 'string', 'max:40'],
            'color' => ['required', 'string', 'regex:/^#[0-9A-F]{6}$/'],
            'role' => ['required', 'string', 'in:owner,member,restricted'],
            'pin' => ['required', 'string', self::PIN_RULE],
        ]);
    }
}
