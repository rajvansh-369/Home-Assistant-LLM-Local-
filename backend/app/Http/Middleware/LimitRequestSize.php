<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Refuses /api bodies over ASTER_MAX_REQUEST_KB (1 MB by default) with 413,
 * before anything parses them.
 */
class LimitRequestSize
{
    public function handle(Request $request, Closure $next): Response
    {
        $limit = (int) config('aster.max_request_kb') * 1024;
        $declared = (int) $request->server('CONTENT_LENGTH', $request->header('Content-Length', '0'));

        if ($declared > $limit || strlen((string) $request->getContent()) > $limit) {
            return response()->json(['message' => 'The request is too large.'], 413);
        }

        return $next($request);
    }
}
