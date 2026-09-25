<?php

use App\Enums\WebMode;
use App\Models\Profile;
use App\Services\LlmTokenIssuer;

it('carries every claim in §4', function () {
    $this->travelTo('2026-09-24 10:15:00');
    $profile = Profile::factory()->owner()->create();

    $issued = app(LlmTokenIssuer::class)->issue($profile);

    expect(llmClaims($issued['token']))->toBe([
        'iss' => 'aster',
        'aud' => 'h'.$profile->user_id,
        'sub' => 'profile:'.$profile->id,
        'scope' => 'p'.$profile->id,
        'web' => 'auto',
        'memory' => true,
        'iat' => now()->getTimestamp(),
        'exp' => now()->addHours(12)->getTimestamp(),
    ])->and($issued['expires_at']->toDateTimeString())->toBe('2026-09-24 22:15:00');
});

it('sets web and memory from the role table', function (string $role, WebMode $webMode, bool $memory, string $web, bool $memoryClaim) {
    $profile = Profile::factory()->{$role}()->create(['web_mode' => $webMode, 'memory_enabled' => $memory]);

    $claims = llmClaims(app(LlmTokenIssuer::class)->issue($profile)['token']);

    expect($claims['web'])->toBe($web)->and($claims['memory'])->toBe($memoryClaim);
})->with([
    'owner, auto, memory on' => ['owner', WebMode::Auto, true, 'auto', true],
    'owner, never, memory off' => ['owner', WebMode::Never, false, 'never', false],
    'member, auto, memory on' => ['member', WebMode::Auto, true, 'auto', true],
    'member, never, memory off' => ['member', WebMode::Never, false, 'never', false],
    'restricted, auto, memory on' => ['restricted', WebMode::Auto, true, 'never', true],
    'restricted, auto, memory off' => ['restricted', WebMode::Auto, false, 'never', false],
    'guest, auto, memory on' => ['guest', WebMode::Auto, true, 'never', false],
]);

it('never outlives a given expiry', function () {
    $profile = Profile::factory()->owner()->create();

    $issued = app(LlmTokenIssuer::class)->issue($profile, now()->addMinutes(5));

    expect(llmClaims($issued['token'])['exp'])->toBe(now()->addMinutes(5)->getTimestamp());
});

it('ties each token to its household with aud', function () {
    $a = Profile::factory()->owner()->create();
    $b = Profile::factory()->owner()->create();

    expect(llmClaims(app(LlmTokenIssuer::class)->issue($a)['token'])['aud'])->toBe('h'.$a->user_id)
        ->and(llmClaims(app(LlmTokenIssuer::class)->issue($b)['token'])['aud'])->toBe('h'.$b->user_id);
});
