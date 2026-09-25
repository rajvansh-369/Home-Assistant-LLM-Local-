<?php

namespace App\Enums;

enum LocationEvent: string
{
    case Periodic = 'periodic';
    case Arrived = 'arrived';
    case Left = 'left';
}
