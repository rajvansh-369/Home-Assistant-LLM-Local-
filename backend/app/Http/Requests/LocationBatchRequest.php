<?php

namespace App\Http\Requests;

use App\Enums\LocationEvent;
use App\Models\Profile;
use App\Models\User;
use App\Support\ApiCaller;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class LocationBatchRequest extends FormRequest
{
    public const MAX_BATCH = 500;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<mixed>>
     */
    public function rules(): array
    {
        $caller = ApiCaller::of($this);
        $householdId = $caller instanceof User ? $caller->id : ($caller instanceof Profile ? $caller->user_id : 0);

        return [
            'points' => ['required', 'array', 'min:1', 'max:'.self::MAX_BATCH],
            'points.*' => ['array'],
            'points.*.client_uuid' => ['required', 'uuid', 'distinct'],
            'points.*.lat' => ['required', 'numeric', 'between:-90,90'],
            'points.*.lng' => ['required', 'numeric', 'between:-180,180'],
            'points.*.accuracy_m' => ['nullable', 'numeric', 'between:0,100000'],
            'points.*.event' => ['required', Rule::enum(LocationEvent::class)],
            'points.*.place_id' => ['nullable', 'integer', Rule::exists('places', 'id')->where('user_id', $householdId)],
            'points.*.recorded_at' => ['required', 'date'],
        ];
    }
}
