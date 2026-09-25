<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Demo data has a known password and PIN, so it never reaches production.
        if (app()->isLocal()) {
            $this->call(DemoSeeder::class);
        }
    }
}
