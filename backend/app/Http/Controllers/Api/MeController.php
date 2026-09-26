<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateMeRequest;
use App\Http\Resources\ProfileResource;
use App\Models\Profile;
use App\Support\ApiCaller;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * The unlocked profile reads and edits itself (§5).
 */
class MeController extends Controller
{
    private const FIELDS = ['name', 'color', 'personality', 'web_mode', 'memory_enabled', 'sampling', 'llm_engine', 'max_tokens', 'auto_lock_minutes'];

    public function show(Request $request): ProfileResource
    {
        return new ProfileResource($this->me($request));
    }

    public function update(UpdateMeRequest $request): ProfileResource
    {
        $profile = $this->me($request);
        $changes = Arr::only($request->validated(), self::FIELDS);

        if ($request->has('pin')) {
            if (! Hash::check((string) $request->validated('current_pin'), (string) $profile->pin_hash)) {
                throw ValidationException::withMessages(['current_pin' => 'Wrong PIN.']);
            }
            $changes['pin_hash'] = Hash::make($request->validated('pin'));
        }

        $profile->update($changes);

        return new ProfileResource($profile);
    }

    private function me(Request $request): Profile
    {
        /** @var Profile */
        return ApiCaller::of($request);
    }
}
