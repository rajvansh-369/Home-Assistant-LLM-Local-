<?php

namespace App\Support;

use RuntimeException;

/**
 * The RS256 key pair that signs llm_tokens (docs/aster-backend-plan.md §7).
 */
class JwtKeys
{
    public static function privatePath(): string
    {
        return self::resolve((string) config('aster.jwt.private_key'));
    }

    public static function publicPath(): string
    {
        return self::resolve((string) config('aster.jwt.public_key'));
    }

    /**
     * Relative paths resolve from the project root.
     */
    public static function resolve(string $path): string
    {
        return preg_match('#^([a-zA-Z]:)?[\\\\/]#', $path) ? $path : base_path($path);
    }

    public static function privateKey(): string
    {
        $path = self::privatePath();

        if (! is_readable($path)) {
            throw new RuntimeException('The llm_token private key is missing. Run `php artisan aster:jwt-keys`.');
        }

        return (string) file_get_contents($path);
    }

    /**
     * A new 2048-bit RSA key pair as PEM strings.
     *
     * @return array{private: string, public: string}
     */
    public static function generate(): array
    {
        $options = ['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA];

        $key = openssl_pkey_new($options);

        // PHP on Windows often ships without a default openssl.cnf location.
        if ($key === false && ($config = self::opensslConfig()) !== null) {
            $options['config'] = $config;
            $key = openssl_pkey_new($options);
        }

        if ($key === false || ! openssl_pkey_export($key, $private, null, $options)) {
            throw new RuntimeException('OpenSSL could not create a key pair: '.(openssl_error_string() ?: 'unknown error'));
        }

        $details = openssl_pkey_get_details($key);
        if ($details === false) {
            throw new RuntimeException('OpenSSL could not read the new public key.');
        }

        return ['private' => $private, 'public' => $details['key']];
    }

    private static function opensslConfig(): ?string
    {
        $candidates = array_filter([
            getenv('OPENSSL_CONF') ?: null,
            dirname(PHP_BINARY).DIRECTORY_SEPARATOR.'extras'.DIRECTORY_SEPARATOR.'ssl'.DIRECTORY_SEPARATOR.'openssl.cnf',
        ]);

        foreach ($candidates as $candidate) {
            if (is_readable($candidate)) {
                return $candidate;
            }
        }

        return null;
    }
}
