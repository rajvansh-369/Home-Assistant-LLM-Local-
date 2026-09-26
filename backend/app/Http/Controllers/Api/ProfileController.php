<?php

namespace App\Http\Controllers\Api;

use App\Enums\ProfileRole;
use App\Enums\WebMode;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProfileRequest;
use App\Http\Requests\UpdateProfileRequest;
use App\Http\Resources\ProfileResource;
use App\Http\Resources\ProfileSummaryResource;
use App\Models\Profile;
use App\Models\User;
use App\Support\ApiCaller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * The household's profiles (§5). Creating the Owner also creates Guest.
 */
class ProfileController extends Controller
{
    public const GUEST_COLOR = '#9299A1';

    /** Fields a request may set directly; pin and role are handled on their own. */
    private const FIELDS = ['name', 'color', 'personality', 'web_mode', 'memory_enabled', 'sampling', 'llm_engine', 'max_tokens', 'auto_lock_minutes'];

    public function index(Request $request): AnonymousResourceCollection
    {
        /** @var User $household */
        $household = ApiCaller::of($request);

        return ProfileSummaryResource::collection($household->profiles()->orderBy('id')->get());
    }

    public function store(StoreProfileRequest $request): JsonResponse
    {
        $caller = ApiCaller::of($request);
        $household = $caller instanceof Profile ? $caller->user : $caller;
        $role = ProfileRole::from($request->validated('role'));

        $profile = DB::transaction(function () use ($request, $household, $role) {
            $existing = $household->profiles()->lockForUpdate()->get();

            if ($existing->isEmpty() && $role !== ProfileRole::Owner) {
                throw ValidationException::withMessages(['role' => 'The first profile must be the Owner.']);
            }
            if ($role === ProfileRole::Owner && $existing->contains(fn (Profile $p) => $p->isOwner())) {
                throw ValidationException::withMessages(['role' => 'This household already has an Owner.']);
            }

            $profile = $household->profiles()->create([
                ...Arr::only($request->validated(), self::FIELDS),
                'role' => $role,
                'pin_hash' => Hash::make($request->validated('pin')),
            ]);

            if ($role === ProfileRole::Owner && ! $existing->contains(fn (Profile $p) => $p->isGuest())) {
                $household->profiles()->create([
                    'name' => 'Guest',
                    'color' => self::GUEST_COLOR,
                    'role' => ProfileRole::Guest,
                    'pin_hash' => null,
                    'web_mode' => WebMode::Never,
                    'memory_enabled' => false,
                ]);
            }

            return $profile;
        });

        return (new ProfileResource($profile->refresh()))->response()->setStatusCode(201);
    }

    public function update(UpdateProfileRequest $request, Profile $profile): ProfileResource
    {
        $changes = Arr::only($request->validated(), self::FIELDS);

        if ($request->has('role')) {
            $changes['role'] = $this->checkedRole($profile, ProfileRole::from($request->validated('role')));
        }

        if ($request->has('pin')) {
            if ($profile->isGuest()) {
                throw ValidationException::withMessages(['pin' => 'Guest has no PIN.']);
            }
            $changes['pin_hash'] = Hash::make($request->validated('pin'));
        }

        $profile->update($changes);

        return new ProfileResource($profile);
    }

    public function destroy(Profile $profile): Response
    {
        Gate::authorize('delete', $profile);

        if ($profile->isOwner() || $profile->isGuest()) {
            throw ValidationException::withMessages(['profile' => 'The Owner and Guest profiles can\'t be deleted.']);
        }

        DB::transaction(function () use ($profile) {
            $profile->tokens()->delete();
            $profile->delete();
        });

        return response()->noContent();
    }

    /**
     * Roles change only between member and restricted.
     */
    private function checkedRole(Profile $profile, ProfileRole $role): ProfileRole
    {
        if ($role === $profile->role) {
            return $role;
        }

        $message = match (true) {
            $profile->isOwner() => 'The Owner\'s role can\'t change.',
            $profile->isGuest() => 'Guest\'s role can\'t change.',
            ! in_array($role, [ProfileRole::Member, ProfileRole::Restricted], true) => 'A role can only change between member and restricted.',
            default => null,
        };

        if ($message !== null) {
            throw ValidationException::withMessages(['role' => $message]);
        }

        return $role;
    }
}
