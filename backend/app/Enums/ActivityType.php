<?php

namespace App\Enums;

/**
 * Activity types the app sends today. activity_logs.type stays a plain
 * string (lowercase letters and underscores, max 40) so a newer app can
 * send new types.
 */
enum ActivityType: string
{
    case SpokenAlert = 'spoken_alert';
    case ReminderFired = 'reminder_fired';
    case ArrivedHome = 'arrived_home';
    case LeftHome = 'left_home';
    case ServerProblem = 'server_problem';
    case ReplySent = 'reply_sent';
}
