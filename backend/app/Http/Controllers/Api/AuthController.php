<?php

namespace App\Http\Controllers\Api;

use App\Enums\AuthEventType;
use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Requests\RegisterRequest;
use App\Http\Resources\DeviceResource;
use App\Http\Resources\HouseholdUserResource;
use App\Models\Device;
use App\Models\User;
use App\Services\AuthEvents;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Household accounts: register, sign in and sign out a phone (§5).
 */
class AuthController extends Controller
{
    public function __construct(private AuthEvents $events) {}

    public function register(RegisterRequest $request): JsonResponse
    {
        if (config('aster.registration') === 'single' && User::query()->exists()) {
            abort(403, 'Registration is closed.');
        }

        [$household, $device, $token] = DB::transaction(function () use ($request) {
            $household = User::create($request->safe()->only(['name', 'email', 'password']));

            return [$household, ...$this->signIn($household, $request)];
        });

        $this->events->record(AuthEventType::Register, $request, $household, device: $device);

        return $this->session($household, $device, $token, 201);
    }

    public function login(LoginRequest $request): JsonResponse
    {
        $household = User::query()->where('email', $request->validated('email'))->first();

        if ($household === null || ! Hash::check($request->validated('password'), $household->password)) {
            $this->events->record(AuthEventType::LoginFailed, $request, $household);

            throw ValidationException::withMessages(['email' => 'Email or password is wrong.']);
        }

        if ($household->isSuspended()) {
            abort(403, 'This account is suspended.');
        }

        [$device, $token] = DB::transaction(fn () => $this->signIn($household, $request));

        $this->events->record(AuthEventType::Login, $request, $household, device: $device);

        return $this->session($household, $device, $token);
    }

    public function logout(Request $request): Response
    {
        /** @var User $household */
        $household = $request->user();
        /** @var Device $device */
        $device = $request->attributes->get('device');

        /** @var PersonalAccessToken $token */
        $token = $household->currentAccessToken();
        $token->delete();
        $device->forceFill(['signed_out_at' => now()])->save();

        $this->events->record(AuthEventType::Logout, $request, $household, device: $device);

        return response()->noContent();
    }

    /**
     * A devices row and its device token.
     *
     * @return array{Device, string}
     */
    private function signIn(User $household, RegisterRequest|LoginRequest $request): array
    {
        $device = $household->devices()->create([
            'name' => $request->validated('device_name'),
            'app_version' => $request->validated('app_version'),
            'last_seen_at' => now(),
        ]);

        $token = $household->createToken('device:'.$device->id, ['device'])->plainTextToken;

        return [$device, $token];
    }

    private function session(User $household, Device $device, string $token, int $status = 200): JsonResponse
    {
        return response()->json([
            'token' => $token,
            'household_id' => $household->householdId(),
            'user' => new HouseholdUserResource($household),
            'device' => new DeviceResource($device),
        ], $status);
    }
}
