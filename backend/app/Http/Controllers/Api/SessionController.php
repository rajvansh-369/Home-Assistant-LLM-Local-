<?php

namespace App\Http\Controllers\Api;

use App\Enums\AuthEventType;
use App\Enums\ProfileRole;
use App\Http\Controllers\Controller;
use App\Http\Requests\UnlockRequest;
use App\Models\Profile;
use App\Models\User;
use App\Services\AuthEvents;
use App\Services\LlmTokenIssuer;
use App\Services\PinGuard;
use App\Services\ProfileSessions;
use App\Support\ApiCaller;
use App\Support\ApiTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * Unlock, lock, llm_token refresh and Guest sessions (§4, §5).
 */
class SessionController extends Controller
{
    public function __construct(
        private PinGuard $pins,
        private ProfileSessions $sessions,
        private LlmTokenIssuer $llmTokens,
        private AuthEvents $events,
    ) {}

    public function unlock(UnlockRequest $request, Profile $profile): JsonResponse
    {
        if ($profile->isGuest()) {
            throw ValidationException::withMessages(['pin' => 'Guest opens without a PIN; use a Guest session.']);
        }

        $device = $this->device($request);
        $this->pins->check($profile, $request->validated('pin'), $request, $device);

        return response()->json($this->sessions->open($profile, $device));
    }

    public function guest(Request $request): JsonResponse
    {
        /** @var User $household */
        $household = ApiCaller::of($request);
        $guest = $household->profiles()->where('role', ProfileRole::Guest)->first();

        abort_if($guest === null, 404, 'This household has no Guest profile yet.');

        $device = $this->device($request);
        $session = $this->sessions->open($guest, $device);
        $this->events->record(AuthEventType::GuestSession, $request, profile: $guest, device: $device);

        return response()->json($session);
    }

    public function lock(Request $request, Profile $profile): Response
    {
        /** @var Profile $caller */
        $caller = ApiCaller::of($request);

        abort_unless($caller->is($profile), 403, 'You can only lock your own profile.');

        /** @var PersonalAccessToken $token */
        $token = $caller->currentAccessToken();
        $token->delete();

        return response()->noContent();
    }

    public function llmToken(Request $request): JsonResponse
    {
        /** @var Profile $profile */
        $profile = ApiCaller::of($request);
        /** @var PersonalAccessToken $token */
        $token = $profile->currentAccessToken();

        $llm = $this->llmTokens->issue($profile, $token->expires_at);

        return response()->json([
            'llm_token' => $llm['token'],
            'expires_at' => ApiTime::format($llm['expires_at']),
        ]);
    }
}
