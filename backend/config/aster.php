<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Registration
    |--------------------------------------------------------------------------
    |
    | "open": any household can sign up. "single": sign-up closes once the
    | first household exists.
    |
    */

    'registration' => env('ASTER_REGISTRATION', 'open'),

    /*
    |--------------------------------------------------------------------------
    | Admin panel
    |--------------------------------------------------------------------------
    |
    | The first super admin (created in Phase 7), the timezone used for day
    | boundaries on the dashboard and the location day picker, and an optional
    | comma-separated IP allowlist for /admin (empty allows all).
    |
    */

    'admin' => [
        'email' => env('ASTER_ADMIN_EMAIL'),
        'timezone' => env('ASTER_ADMIN_TIMEZONE', 'Asia/Kolkata'),
        'allowed_ips' => array_values(array_filter(array_map(
            'trim',
            explode(',', (string) env('ASTER_ADMIN_ALLOWED_IPS', '')),
        ))),
    ],

    /*
    |--------------------------------------------------------------------------
    | llm_token (RS256 JWT)
    |--------------------------------------------------------------------------
    |
    | The private key signs llm_tokens and never leaves the server. The public
    | key is copied to each home PC for zypherLL. The issuer must match
    | zypherLL's issuer check. Relative paths resolve from the project root.
    |
    */

    'jwt' => [
        'private_key' => env('ASTER_JWT_PRIVATE_KEY', 'storage/keys/aster-jwt.key'),
        'public_key' => env('ASTER_JWT_PUBLIC_KEY', 'storage/keys/aster-jwt.pub'),
        'issuer' => env('ASTER_JWT_ISSUER', 'aster'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Token lifetime
    |--------------------------------------------------------------------------
    |
    | Hours a profile token and an llm_token stay valid.
    |
    */

    'token_hours' => (int) env('ASTER_TOKEN_HOURS', 12),

    /*
    |--------------------------------------------------------------------------
    | Request size
    |--------------------------------------------------------------------------
    |
    | /api requests with a larger body get 413.
    |
    */

    'max_request_kb' => (int) env('ASTER_MAX_REQUEST_KB', 1024),

    /*
    |--------------------------------------------------------------------------
    | Trusted proxies
    |--------------------------------------------------------------------------
    |
    | The load balancer or reverse proxy in front of the app, whose
    | X-Forwarded-* headers are believed: "*" for any, a comma-separated list
    | of IPs or CIDR ranges, or empty for none.
    |
    */

    'trusted_proxies' => env('ASTER_TRUSTED_PROXIES', ''),

];
