<?php

namespace App\Support;

use Carbon\CarbonImmutable;

/**
 * Days on the admin panel are days in ASTER_ADMIN_TIMEZONE; the database
 * holds UTC. These turn a local date into the UTC instants that bound it.
 */
final class AdminDay
{
    public static function timezone(): string
    {
        return (string) config('aster.admin.timezone');
    }

    public static function today(): string
    {
        return CarbonImmutable::now(self::timezone())->toDateString();
    }

    /**
     * The first instant of the local day, in UTC.
     */
    public static function start(string $date): CarbonImmutable
    {
        return CarbonImmutable::parse($date, self::timezone())->startOfDay()->utc();
    }

    /**
     * The first instant of the next local day, in UTC (exclusive end).
     */
    public static function end(string $date): CarbonImmutable
    {
        return CarbonImmutable::parse($date, self::timezone())->addDay()->startOfDay()->utc();
    }
}
