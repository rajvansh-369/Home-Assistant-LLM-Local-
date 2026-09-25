<?php

namespace App\Http\Requests;

use Illuminate\Auth\Access\Response;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class UpdateProfileRequest extends FormRequest
{
    use ProfileFields;

    public function authorize(): Response
    {
        return Gate::inspect('update', $this->route('profile'));
    }

    /**
     * @return array<string, array<mixed>>
     */
    public function rules(): array
    {
        return array_merge($this->profileFieldRules(), [
            'role' => ['sometimes', 'required', 'string', 'in:owner,member,restricted,guest'],
        ]);
    }
}
