<?php

namespace App\Support;

use DateTimeInterface;
use Illuminate\Support\Carbon;

/**
 * API times are ISO 8601 in UTC with a Z and no fractions: 2026-09-24T10:15:00Z.
 */
class ApiTime
{
    public static function format(?DateTimeInterface $time): ?string
    {
        return $time === null ? null : Carbon::instance($time)->utc()->format('Y-m-d\TH:i:s\Z');
    }
}
