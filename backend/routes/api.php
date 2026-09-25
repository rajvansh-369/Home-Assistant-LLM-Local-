<?php

use App\Http\Controllers\Api\ActivityController;
use App\Http\Controllers\Api\AlertSettingController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChatMessageController;
use App\Http\Controllers\Api\ConversationController;
use App\Http\Controllers\Api\LocationController;
use App\Http\Controllers\Api\LocationSettingController;
use App\Http\Controllers\Api\MeController;
use App\Http\Controllers\Api\PlaceController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\ReminderController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\VipContactController;
use Illuminate\Support\Facades\Route;

// The route file from docs/aster-backend-plan.md §5 (Laravel adds the /api prefix).

Route::middleware('throttle:auth')->group(function () {
    Route::post('auth/register', [AuthController::class, 'register']);
    Route::post('auth/login', [AuthController::class, 'login']);
});

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    // A device token may create only the first profile; after that the Owner (ProfilePolicy)
    Route::post('profiles', [ProfileController::class, 'store']);

    Route::middleware('device')->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('profiles', [ProfileController::class, 'index']);
        Route::post('profiles/{profile}/unlock', [SessionController::class, 'unlock']);
        Route::post('guest-sessions', [SessionController::class, 'guest']);
        Route::post('locations/batch', [LocationController::class, 'batch'])->middleware('throttle:batch');
        Route::post('activity/batch', [ActivityController::class, 'batch'])->middleware('throttle:batch');
    });

    Route::middleware('profile')->group(function () {
        Route::post('profiles/{profile}/lock', [SessionController::class, 'lock']);
        Route::post('llm-token', [SessionController::class, 'llmToken']);

        Route::middleware('not-guest')->group(function () {
            Route::get('me', [MeController::class, 'show']);
            Route::patch('me', [MeController::class, 'update']);
            Route::get('sync', SyncController::class);
            Route::apiResource('conversations', ConversationController::class)->only(['index', 'store', 'destroy']);
            Route::get('conversations/{conversation}/messages', [ChatMessageController::class, 'index']);
            Route::post('conversations/{conversation}/messages', [ChatMessageController::class, 'store']);
            Route::patch('chat-messages/{message}', [ChatMessageController::class, 'update']);
            Route::apiResource('reminders', ReminderController::class)->except('show');
            Route::get('activity', [ActivityController::class, 'index']);

            Route::middleware('owner')->group(function () {
                Route::apiResource('profiles', ProfileController::class)->only(['update', 'destroy']);
                Route::get('places/home', [PlaceController::class, 'show']);
                Route::put('places/home', [PlaceController::class, 'update']);
                Route::get('locations', [LocationController::class, 'index']);
                Route::get('location-settings', [LocationSettingController::class, 'show']);
                Route::put('location-settings', [LocationSettingController::class, 'update']);
                Route::get('alert-settings', [AlertSettingController::class, 'show']);
                Route::put('alert-settings', [AlertSettingController::class, 'update']);
                Route::apiResource('vip-contacts', VipContactController::class)->except('show');
            });
        });
    });
});
