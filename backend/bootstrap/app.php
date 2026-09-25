<?php

use App\Http\Middleware\EnsureCanUseReminders;
use App\Http\Middleware\EnsureDeviceToken;
use App\Http\Middleware\EnsureNotGuest;
use App\Http\Middleware\EnsureOwner;
use App\Http\Middleware\EnsureProfileToken;
use App\Http\Middleware\LimitRequestSize;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'device' => EnsureDeviceToken::class,
            'profile' => EnsureProfileToken::class,
            'owner' => EnsureOwner::class,
            'not-guest' => EnsureNotGuest::class,
        ]);

        // Check the token type and role before route bindings run, so the wrong
        // token gets 403 rather than a 404 from a binding it can't resolve.
        foreach ([EnsureDeviceToken::class, EnsureProfileToken::class, EnsureNotGuest::class, EnsureOwner::class, EnsureCanUseReminders::class] as $class) {
            $middleware->prependToPriorityList(before: SubstituteBindings::class, prepend: $class);
        }

        // API clients get a 401, never a redirect to a login page.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : '/');

        // 413 before anything parses an oversized body.
        $middleware->api(prepend: [LimitRequestSize::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // A query error's message holds the SQL bindings, which can be coordinates or
        // encrypted chat text. Log what went wrong without them.
        $exceptions->report(function (QueryException $e) {
            Log::error('Database error.', [
                'sqlstate' => $e->errorInfo[0] ?? null,
                'driver_code' => $e->errorInfo[1] ?? null,
                'connection' => $e->getConnectionName(),
                'at' => $e->getFile().':'.$e->getLine(),
            ]);
        })->stop();

        // Missing rows and unknown routes: a plain 404 that names no model or path.
        $exceptions->render(function (ModelNotFoundException $e, Request $request) {
            return $request->is('api/*') ? response()->json(['message' => 'Not found.'], 404) : null;
        });
        $exceptions->render(function (NotFoundHttpException $e, Request $request) {
            $generic = $e->getMessage() === '' || str_starts_with($e->getMessage(), 'The route ')
                || $e->getPrevious() instanceof ModelNotFoundException;

            return $request->is('api/*') && $generic ? response()->json(['message' => 'Not found.'], 404) : null;
        });

        $exceptions->render(function (ThrottleRequestsException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            $retryAfter = (int) ($e->getHeaders()['Retry-After'] ?? 60);

            return response()->json([
                'message' => "Too many requests. Try again in {$retryAfter} s.",
                'retry_after' => $retryAfter,
            ], 429, $e->getHeaders());
        });
    })->create();
