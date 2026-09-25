<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\IpUtils;
use Symfony\Component\HttpFoundation\Response;

/**
 * Limits /admin to ASTER_ADMIN_ALLOWED_IPS (IPs or CIDR ranges). Empty allows
 * everyone. Behind a proxy, set ASTER_TRUSTED_PROXIES so the client's real
 * address is checked.
 */
class AdminIpAllowlist
{
    public function handle(Request $request, Closure $next): Response
    {
        /** @var list<string> $allowed */
        $allowed = config('aster.admin.allowed_ips', []);

        if ($allowed !== [] && ! IpUtils::checkIp((string) $request->ip(), $allowed)) {
            abort(403);
        }

        return $next($request);
    }
}
