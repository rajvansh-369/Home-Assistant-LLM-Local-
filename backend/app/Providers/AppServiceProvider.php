<?php

namespace App\Providers;

use App\Models\Admin;
use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\Profile;
use App\Models\Reminder;
use App\Models\VipContact;
use App\Services\DeviceTracker;
use App\Support\ApiCaller;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\SecurityScheme;
use Illuminate\Auth\Events\Login;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Stack traces in logs leave out argument values, which could be PINs or passwords.
        ini_set('zend.exception_ignore_args', '1');
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->configureHttps();
        $this->configureRateLimiting();
        $this->configureRouteBindings();
        $this->configureApiDocs();

        // Filament fires Login once the password and the authenticator code have both passed.
        Event::listen(Login::class, function (Login $event): void {
            if ($event->guard === 'admin' && $event->user instanceof Admin) {
                $event->user->forceFill(['last_login_at' => now()])->save();
            }
        });
    }

    /**
     * Production runs behind HTTPS, usually with a proxy terminating TLS.
     */
    private function configureHttps(): void
    {
        $proxies = trim((string) config('aster.trusted_proxies'));
        if ($proxies !== '') {
            TrustProxies::at($proxies === '*' ? '*' : array_map('trim', explode(',', $proxies)));
        }

        if ($this->app->isProduction()) {
            URL::forceScheme('https');
        }
    }

    /**
     * OpenAPI docs from Scramble, a dev-only package: /docs/api locally, and
     * `php artisan scramble:export` for the Android side.
     */
    private function configureApiDocs(): void
    {
        if (! class_exists(Scramble::class)) {
            return;
        }

        Scramble::configure()->withDocumentTransformers(function (OpenApi $openApi) {
            $openApi->secure(SecurityScheme::http('bearer'));
        });
    }

    /**
     * Route parameters resolve through the token, so another household's id is a 404.
     */
    private function configureRouteBindings(): void
    {
        Route::bind('profile', function (string $value) {
            $caller = ApiCaller::of(request());
            $householdId = $caller instanceof Profile ? $caller->user_id : $caller?->id;

            return Profile::query()
                ->where('user_id', $householdId)
                ->whereKey(self::id($value))
                ->firstOrFail();
        });

        Route::bind('vip_contact', function (string $value) {
            $caller = ApiCaller::of(request());

            return VipContact::query()
                ->where('user_id', $caller instanceof Profile ? $caller->user_id : $caller?->id)
                ->whereKey(self::id($value))
                ->firstOrFail();
        });

        // These belong to one profile: only the unlocked profile's rows resolve.
        Route::bind('conversation', fn (string $value) => Conversation::query()
            ->where('profile_id', self::callerProfileId())
            ->whereKey(self::id($value))
            ->firstOrFail());

        Route::bind('message', fn (string $value) => ChatMessage::query()
            ->whereHas('conversation', fn ($query) => $query->where('profile_id', self::callerProfileId()))
            ->whereKey(self::id($value))
            ->firstOrFail());

        Route::bind('reminder', fn (string $value) => Reminder::query()
            ->where('profile_id', self::callerProfileId())
            ->whereKey(self::id($value))
            ->firstOrFail());
    }

    private static function callerProfileId(): int
    {
        $caller = ApiCaller::of(request());

        return $caller instanceof Profile ? $caller->id : 0;
    }

    /**
     * A route id, or 0 (which matches nothing) when it isn't a number.
     */
    private static function id(string $value): int
    {
        return ctype_digit($value) ? (int) $value : 0;
    }

    /**
     * The three limiters in docs/aster-backend-plan.md §5. Every named limiter
     * a route uses must be defined here.
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('auth', fn (Request $request) => Limit::perMinute(10)
            ->by('auth:'.Str::lower(trim((string) $request->input('email'))).'|'.$request->ip()));

        RateLimiter::for('api', function (Request $request) {
            $token = $request->user()?->currentAccessToken();

            return Limit::perMinute(120)->by($token instanceof PersonalAccessToken ? 'token:'.$token->getKey() : 'ip:'.$request->ip());
        });

        RateLimiter::for('batch', function (Request $request) {
            $token = $request->user()?->currentAccessToken();
            $deviceId = $token instanceof PersonalAccessToken ? DeviceTracker::deviceIdFromName($token->name) : null;

            return Limit::perMinute(30)->by($deviceId !== null ? 'device:'.$deviceId : 'ip:'.$request->ip());
        });
    }
}
