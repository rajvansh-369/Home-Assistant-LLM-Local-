<?php

namespace App\Enums;

enum FinishReason: string
{
    case Stop = 'stop';
    case Length = 'length';
    case Cancelled = 'cancelled';
    case Error = 'error';
}
