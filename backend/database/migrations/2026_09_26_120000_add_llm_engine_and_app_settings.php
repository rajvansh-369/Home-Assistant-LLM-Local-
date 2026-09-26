<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Each profile picks its assistant engine (local or markl), and app_settings
 * holds the few values the admin panel edits for every household, such as
 * the name the app shows for the Mark-L engine.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('profiles', function (Blueprint $table) {
            $table->string('llm_engine', 20)->default('local')->after('sampling');
        });

        Schema::create('app_settings', function (Blueprint $table) {
            $table->string('key', 100)->primary();
            $table->text('value')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_settings');

        Schema::table('profiles', function (Blueprint $table) {
            $table->dropColumn('llm_engine');
        });
    }
};
