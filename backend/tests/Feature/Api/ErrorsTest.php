<?php

use App\Models\Profile;
use App\Providers\AppServiceProvider;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;

afterEach(fn () => TrustProxies::flushState());

it('answers an unknown API route with a plain JSON 404', function () {
    $this->get('/api/nothing-here')->assertNotFound()->assertExactJson(['message' => 'Not found.']);
});

it('answers a missing model with a 404 that names no model', function () {
    $owner = Profile::factory()->owner()->create();

    $this->withToken(profileToken($owner))->deleteJson('/api/conversations/999999')
        ->assertNotFound()->assertExactJson(['message' => 'Not found.']);
});

it('keeps a deliberate 404 message', function () {
    $owner = Profile::factory()->owner()->create();

    $this->withToken(profileToken($owner))->getJson('/api/places/home')
        ->assertNotFound()->assertExactJson(['message' => 'No home is saved yet.']);
});

it('answers a wrong method with JSON', function () {
    $this->put('/api/auth/login')->assertStatus(405)->assertJsonStructure(['message']);
});

it('hides 500 details when APP_DEBUG is false', function () {
    config(['app.debug' => false]);
    Route::middleware('api')->get('api/_test/boom', fn () => throw new RuntimeException('secret-detail in /var/www'));

    $response = $this->get('/api/_test/boom');

    $response->assertStatus(500)->assertExactJson(['message' => 'Server Error']);
    expect($response->getContent())->not->toContain('secret-detail');
});

it('logs a database error without its SQL bindings', function () {
    Log::spy();
    Route::middleware('api')->get('api/_test/query', fn () => DB::select('select * from no_such_table where lat = ?', ['12.3456789']));

    $this->get('/api/_test/query')->assertStatus(500)->assertExactJson(['message' => 'Server Error']);

    Log::shouldHaveReceived('error')->once()->withArgs(function (string $message, array $context) {
        return $message === 'Database error.'
            && ! str_contains(json_encode($context), '12.3456789')
            && ($context['sqlstate'] ?? null) === '42S02';
    });
});

it('leaves argument values out of stack traces', function () {
    expect(ini_get('zend.exception_ignore_args'))->toBe('1');
});

it('forces https URLs in production', function () {
    $this->app['env'] = 'production';
    $this->app->getProvider(AppServiceProvider::class)->boot();

    expect(url('/api/me'))->toStartWith('https://');
});

it('trusts the configured proxy\'s forwarded headers', function () {
    Route::get('api/_test/secure', fn () => ['secure' => request()->isSecure(), 'ip' => request()->ip()]);

    $this->getJson('/api/_test/secure', ['X-Forwarded-Proto' => 'https', 'X-Forwarded-For' => '203.0.113.9'])
        ->assertExactJson(['secure' => false, 'ip' => '127.0.0.1']);

    config(['aster.trusted_proxies' => '127.0.0.1']);
    $this->app->getProvider(AppServiceProvider::class)->boot();

    $this->getJson('/api/_test/secure', ['X-Forwarded-Proto' => 'https', 'X-Forwarded-For' => '203.0.113.9'])
        ->assertExactJson(['secure' => true, 'ip' => '203.0.113.9']);
});
