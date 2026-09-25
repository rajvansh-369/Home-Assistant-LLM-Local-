<?php

namespace Tests\Support;

use App\Support\JwtKeys;
use Firebase\JWT\JWT;

/**
 * The throwaway key pair and sample llm_token in tests/Fixtures/jwt/, for
 * this app's tests and zypherLL's (docs/aster-backend-plan.md §7). Never the
 * real storage/keys pair.
 *
 * Rebuild with: ASTER_REBUILD_JWT_FIXTURE=1 php artisan test --filter=JwtFixture
 */
class JwtFixture
{
    public static function dir(): string
    {
        return dirname(__DIR__).DIRECTORY_SEPARATOR.'Fixtures'.DIRECTORY_SEPARATOR.'jwt';
    }

    public static function privateKeyPath(): string
    {
        return self::dir().DIRECTORY_SEPARATOR.'test-jwt.key';
    }

    public static function publicKeyPath(): string
    {
        return self::dir().DIRECTORY_SEPARATOR.'test-jwt.pub';
    }

    public static function tokenPath(): string
    {
        return self::dir().DIRECTORY_SEPARATOR.'sample-token.txt';
    }

    public static function claimsPath(): string
    {
        return self::dir().DIRECTORY_SEPARATOR.'claims.json';
    }

    /**
     * Household h1, profile 12, expiring at the end of 2099.
     *
     * @return array<string, mixed>
     */
    public static function claims(): array
    {
        return [
            'iss' => 'aster',
            'aud' => 'h1',
            'sub' => 'profile:12',
            'scope' => 'p12',
            'web' => 'auto',
            'memory' => true,
            'iat' => 1790208000, // 2026-09-24T00:00:00Z
            'exp' => 4102444799, // 2099-12-31T23:59:59Z
        ];
    }

    public static function build(): void
    {
        $keys = JwtKeys::generate();

        if (! is_dir(self::dir())) {
            mkdir(self::dir(), 0755, true);
        }

        file_put_contents(self::privateKeyPath(), $keys['private']);
        file_put_contents(self::publicKeyPath(), $keys['public']);
        file_put_contents(self::claimsPath(), json_encode(self::claims(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)."\n");
        file_put_contents(self::tokenPath(), JWT::encode(self::claims(), $keys['private'], 'RS256')."\n");
    }
}
