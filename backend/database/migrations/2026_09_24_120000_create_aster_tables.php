<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The household tables from docs/aster-backend-plan.md §3. users lives in
 * the default users migration; admins and admin_audit_logs have their own.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 40);
            $table->string('color', 7);
            $table->string('role', 20);
            $table->string('pin_hash')->nullable();
            $table->text('personality')->nullable();
            $table->string('web_mode', 20)->default('auto');
            $table->boolean('memory_enabled')->default(true);
            $table->string('sampling', 20)->default('auto');
            $table->unsignedSmallInteger('max_tokens')->nullable();
            $table->unsignedSmallInteger('auto_lock_minutes')->nullable();
            $table->timestamp('last_unlocked_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('app_version', 40)->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('signed_out_at')->nullable();
            $table->timestamps();
        });

        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('profile_id')->constrained()->cascadeOnDelete();
            $table->uuid('client_uuid')->unique();
            $table->string('title', 120);
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->uuid('client_uuid')->unique();
            $table->string('role', 20);
            // Encrypted: up to 50,000 characters of plain text grows well past TEXT's 64 KB.
            $table->mediumText('content');
            $table->timestamp('sent_at');
            $table->string('finish_reason', 20)->nullable();
            $table->unsignedBigInteger('memory_id')->nullable(); // zypherLL's memory record id
            $table->boolean('live')->default(false);
            $table->boolean('cited')->default(false);
            $table->json('sources')->nullable();
            $table->unsignedInteger('recalled')->nullable();
            $table->string('sampling', 20)->nullable();
            $table->json('usage')->nullable();
            $table->decimal('seconds', 8, 2)->nullable();
            $table->string('rating', 10)->nullable();
            $table->json('context')->nullable();
            $table->timestamps();

            $table->index(['conversation_id', 'id']);
            $table->index('created_at');
        });

        Schema::create('places', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 60);
            $table->string('address');
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->unsignedSmallInteger('radius_m')->default(150);
            $table->string('wifi_ssid', 64)->nullable();
            $table->string('llm_url')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'name']);
        });

        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->uuid('client_uuid')->unique();
            $table->decimal('lat', 10, 7);
            $table->decimal('lng', 10, 7);
            $table->decimal('accuracy_m', 8, 2)->nullable();
            $table->string('event', 20);
            $table->foreignId('place_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('recorded_at');
            $table->timestamp('created_at')->nullable();

            $table->index(['user_id', 'recorded_at']);
        });

        Schema::create('location_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->boolean('enabled')->default(true);
            $table->unsignedSmallInteger('interval_minutes')->default(15);
            $table->unsignedSmallInteger('retention_days')->default(30);
            $table->boolean('share_area')->default(false);
            $table->timestamp('paused_until')->nullable();
            $table->timestamps();
        });

        Schema::create('vip_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 60);
            $table->string('match_key', 120);
            $table->json('sources');
            $table->boolean('enabled')->default(true);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('alert_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->boolean('enabled')->default(true);
            $table->unsignedSmallInteger('missed_after_minutes')->default(10);
            $table->string('speak_mode', 20)->default('full');
            $table->time('quiet_start')->nullable();
            $table->time('quiet_end')->nullable();
            $table->json('urgent_keywords')->nullable();
            $table->boolean('headphones_only')->default(false);
            $table->boolean('only_at_home')->default(false);
            $table->timestamps();
        });

        Schema::create('reminders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('profile_id')->constrained()->cascadeOnDelete();
            $table->uuid('client_uuid')->unique();
            $table->string('title', 200);
            $table->timestamp('due_at')->nullable();
            $table->string('trigger', 20)->default('time');
            $table->string('status', 20)->default('pending');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('profile_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $table->uuid('client_uuid')->unique();
            $table->string('type', 40);
            $table->string('summary', 200);
            $table->json('meta')->nullable();
            $table->timestamp('occurred_at');
            $table->timestamp('created_at')->nullable();

            $table->index(['user_id', 'occurred_at']);
            $table->index(['type', 'occurred_at']);
        });

        Schema::create('auth_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('profile_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type', 20);
            $table->string('ip', 45)->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['type', 'created_at']);
            $table->index(['user_id', 'created_at']);
        });

        Schema::create('device_activity_days', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->date('day');

            $table->unique(['device_id', 'day']);
            $table->index('day');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('device_activity_days');
        Schema::dropIfExists('auth_events');
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('reminders');
        Schema::dropIfExists('alert_settings');
        Schema::dropIfExists('vip_contacts');
        Schema::dropIfExists('location_settings');
        Schema::dropIfExists('locations');
        Schema::dropIfExists('places');
        Schema::dropIfExists('chat_messages');
        Schema::dropIfExists('conversations');
        Schema::dropIfExists('devices');
        Schema::dropIfExists('profiles');
    }
};
