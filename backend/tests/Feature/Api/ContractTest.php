<?php

use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\Device;
use App\Models\Place;
use App\Models\Profile;
use App\Models\Reminder;
use App\Models\User;
use App\Models\VipContact;
use Illuminate\Routing\Route as LaravelRoute;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| The API contract (docs/aster-backend-plan.md §5)
|--------------------------------------------------------------------------
|
| Every route with the token it needs. apiResource registers PUT next to
| every PATCH, so those routes are listed as "PATCH|PUT".
|
| Token kinds:
|   none        no token needed
|   device      a household's device token
|   first       POST /profiles: a device token for the first profile, the Owner after that
|   profile     any unlocked profile, Guest included
|   not-guest   any unlocked profile but Guest
|   reminders   not-guest, and not Restricted either
|   owner       the Owner's profile token
|
*/

const CONTRACT = [
    ['POST', 'auth/register', 'none'],
    ['POST', 'auth/login', 'none'],
    ['POST', 'auth/logout', 'device'],
    ['GET', 'profiles', 'device'],
    ['POST', 'profiles', 'first'],
    ['POST', 'profiles/{profile}/unlock', 'device'],
    ['POST', 'guest-sessions', 'device'],
    ['POST', 'locations/batch', 'device'],
    ['POST', 'activity/batch', 'device'],
    ['POST', 'profiles/{profile}/lock', 'profile'],
    ['POST', 'llm-token', 'profile'],
    ['GET', 'me', 'not-guest'],
    ['PATCH', 'me', 'not-guest'],
    ['GET', 'sync', 'not-guest'],
    ['GET', 'conversations', 'not-guest'],
    ['POST', 'conversations', 'not-guest'],
    ['DELETE', 'conversations/{conversation}', 'not-guest'],
    ['GET', 'conversations/{conversation}/messages', 'not-guest'],
    ['POST', 'conversations/{conversation}/messages', 'not-guest'],
    ['PATCH', 'chat-messages/{message}', 'not-guest'],
    ['GET', 'reminders', 'reminders'],
    ['POST', 'reminders', 'reminders'],
    ['PATCH|PUT', 'reminders/{reminder}', 'reminders'],
    ['DELETE', 'reminders/{reminder}', 'reminders'],
    ['GET', 'activity', 'not-guest'],
    ['PATCH|PUT', 'profiles/{profile}', 'owner'],
    ['DELETE', 'profiles/{profile}', 'owner'],
    ['GET', 'places/home', 'owner'],
    ['PUT', 'places/home', 'owner'],
    ['GET', 'locations', 'owner'],
    ['GET', 'location-settings', 'owner'],
    ['PUT', 'location-settings', 'owner'],
    ['GET', 'alert-settings', 'owner'],
    ['PUT', 'alert-settings', 'owner'],
    ['GET', 'vip-contacts', 'owner'],
    ['POST', 'vip-contacts', 'owner'],
    ['PATCH|PUT', 'vip-contacts/{vip_contact}', 'owner'],
    ['DELETE', 'vip-contacts/{vip_contact}', 'owner'],
];

/** Which callers get past the token and role checks, per token kind. */
const ALLOWED = [
    'none' => ['anonymous', 'device', 'owner', 'member', 'restricted', 'guest'],
    'device' => ['device'],
    'first' => ['owner'], // the household already has profiles, so its device token gets 403
    'profile' => ['owner', 'member', 'restricted', 'guest'],
    'not-guest' => ['owner', 'member', 'restricted'],
    'reminders' => ['owner', 'member'],
    'owner' => ['owner'],
];

const CALLERS = ['anonymous', 'device', 'owner', 'member', 'restricted', 'guest'];

/**
 * A household with every role, one device, and a row of each kind per profile.
 *
 * @return array{tokens: array<string, ?string>, profiles: array<string, Profile>, rows: array<string, mixed>}
 */
function contractHousehold(): array
{
    $household = User::factory()->create();
    $device = Device::factory()->for($household)->create();
    Place::factory()->for($household)->home()->create();
    $vip = VipContact::factory()->for($household)->create();

    $profiles = [];
    $rows = [];
    foreach (['owner', 'member', 'restricted', 'guest'] as $role) {
        $profile = Profile::factory()->for($household)->{$role}()->create();
        $conversation = Conversation::factory()->for($profile)->create();
        $profiles[$role] = $profile;
        $rows[$role] = [
            'profile' => $profile->id,
            'conversation' => $conversation->id,
            'message' => ChatMessage::factory()->for($conversation)->create()->id,
            'reminder' => Reminder::factory()->for($profile)->create()->id,
            'vip_contact' => $vip->id,
        ];
    }
    $rows['device'] = $rows['anonymous'] = $rows['owner'];

    $tokens = ['anonymous' => null, 'device' => deviceToken($household, $device)];
    foreach ($profiles as $role => $profile) {
        $tokens[$role] = profileToken($profile, $device);
    }

    return ['tokens' => $tokens, 'profiles' => $profiles, 'rows' => $rows];
}

function contractUrl(string $uri, array $ids): string
{
    return '/api/'.preg_replace_callback('/\{(\w+)\}/', fn ($m) => (string) $ids[$m[1]], $uri);
}

it('has exactly the routes in §5', function () {
    $actual = collect(Route::getRoutes()->getRoutes())
        ->filter(fn (LaravelRoute $route) => str_starts_with($route->uri(), 'api/'))
        ->map(function (LaravelRoute $route) {
            $methods = array_values(array_diff($route->methods(), ['HEAD']));
            sort($methods);

            return implode('|', $methods).' '.$route->uri();
        })
        ->sort()->values()->all();

    $expected = collect(CONTRACT)->map(fn ($r) => "{$r[0]} api/{$r[1]}")->sort()->values()->all();

    expect(array_values(array_diff($actual, $expected)))->toBe([], 'routes/api.php has routes §5 does not list')
        ->and(array_values(array_diff($expected, $actual)))->toBe([], '§5 lists routes routes/api.php does not have');
});

it('applies the token and role rules', function (string $method, string $uri, string $kind, string $caller) {
    $setup = contractHousehold();
    $token = $setup['tokens'][$caller];
    $url = contractUrl($uri, $setup['rows'][$caller]);

    $request = $token === null ? $this : $this->withToken($token);
    $status = $request->json(explode('|', $method)[0], $url)->status();

    if (in_array($caller, ALLOWED[$kind], true)) {
        expect($status)->not->toBeIn([401, 403], "{$caller} should reach {$method} {$uri}");
    } else {
        expect($status)->toBe($caller === 'anonymous' ? 401 : 403, "{$caller} on {$method} {$uri}");
    }
})->with(function () {
    foreach (CONTRACT as [$method, $uri, $kind]) {
        foreach (CALLERS as $caller) {
            yield "{$caller} {$method} {$uri}" => [$method, $uri, $kind, $caller];
        }
    }
});

it('answers 404 for another household\'s ids', function (string $method, string $uri, string $caller) {
    $mine = contractHousehold();
    $theirs = contractHousehold();

    $this->withToken($mine['tokens'][$caller])
        ->json(explode('|', $method)[0], contractUrl($uri, $theirs['rows']['owner']), ['pin' => '123456'])
        ->assertNotFound()
        ->assertExactJson(['message' => 'Not found.']);
})->with(function () {
    foreach (CONTRACT as [$method, $uri, $kind]) {
        if (str_contains($uri, '{')) {
            yield "{$method} {$uri}" => [$method, $uri, $kind === 'device' ? 'device' : 'owner'];
        }
    }
});

it('answers 404 for another profile\'s rows in the same household', function (string $method, string $uri) {
    $setup = contractHousehold();

    $this->withToken($setup['tokens']['member'])
        ->json(explode('|', $method)[0], contractUrl($uri, $setup['rows']['owner']))
        ->assertNotFound();
})->with([
    ['DELETE', 'conversations/{conversation}'],
    ['GET', 'conversations/{conversation}/messages'],
    ['POST', 'conversations/{conversation}/messages'],
    ['PATCH', 'chat-messages/{message}'],
    ['PATCH', 'reminders/{reminder}'],
    ['DELETE', 'reminders/{reminder}'],
]);
