<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * "Voice and wake word" on the app's 2.4 Edit profile: whether the profile
 * may talk to Aster. The phone enforces it (voice uses the same chat stream
 * as typing); Guest never has voice.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->boolean('voice_enabled')->default(true)->after('history_enabled');
        });

        DB::table('profiles')->where('role', 'guest')->update(['voice_enabled' => false]);
    }

    public function down(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->dropColumn('voice_enabled');
        });
    }
};
