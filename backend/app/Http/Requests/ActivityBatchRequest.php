<?php

namespace App\Http\Requests;

use App\Models\User;
use App\Support\ApiCaller;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ActivityBatchRequest extends FormRequest
{
    public const MAX_BATCH = 500;

    public const MAX_META_BYTES = 2048;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<mixed>>
     */
    public function rules(): array
    {
        $household = ApiCaller::of($this);

        return [
            'events' => ['required', 'array', 'min:1', 'max:'.self::MAX_BATCH],
            'events.*' => ['array'],
            'events.*.client_uuid' => ['required', 'uuid', 'distinct'],
            'events.*.profile_id' => [
                'nullable', 'integer',
                Rule::exists('profiles', 'id')->where('user_id', $household instanceof User ? $household->id : 0),
            ],
            // A plain string rather than ActivityType, so a newer app can send new types.
            'events.*.type' => ['required', 'string', 'max:40', 'regex:/^[a-z_]+$/'],
            'events.*.summary' => ['required', 'string', 'max:200'],
            'events.*.meta' => ['nullable', 'array', function (string $attribute, mixed $value, Closure $fail) {
                if (strlen((string) json_encode($value)) > self::MAX_META_BYTES) {
                    $fail('The meta must be at most 2 KB.');
                }
            }],
            'events.*.occurred_at' => ['required', 'date'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'events.*.profile_id.exists' => 'This profile isn\'t in the household.',
        ];
    }
}
