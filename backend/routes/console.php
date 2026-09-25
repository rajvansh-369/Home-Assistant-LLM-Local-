<?php

use Illuminate\Support\Facades\Schedule;

// Cron runs `php artisan schedule:run` every minute; there is no queue worker.
// Times are server time (UTC).

Schedule::command('aster:prune')->dailyAt('02:30')->withoutOverlapping();
Schedule::command('sanctum:prune-expired --hours=24')->daily();
