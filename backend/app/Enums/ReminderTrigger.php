<?php

namespace App\Enums;

enum ReminderTrigger: string
{
    case Time = 'time';
    case ArriveHome = 'arrive_home';
}
