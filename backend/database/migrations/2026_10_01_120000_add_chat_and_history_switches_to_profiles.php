<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the Owner lets a profile use (the app's 2.4 Edit profile):
 * chat_enabled ("Chat with Aster"; on Guest it is "Allow guest sessions")
 * and history_enabled ("Keep chat history").
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->boolean('chat_enabled')->default(true)->after('memory_enabled');
            $table->boolean('history_enabled')->default(true)->after('chat_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->dropColumn(['chat_enabled', 'history_enabled']);
        });
    }
};
