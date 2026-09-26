<?php

namespace App\Filament\Auth;

use Filament\Auth\MultiFactor\App\AppAuthentication as BaseAppAuthentication;
use SensitiveParameter;

/**
 * Filament's authenticator-app MFA, with a working setup QR code.
 *
 * pragmarx/google2fa-qrcode v4 already returns a `data:image/svg+xml;base64,`
 * URI, but Filament's fallback for servers without imagick wraps it a second
 * time, so the browser gets a broken image. Unwrap it when that happens.
 */
class AppAuthentication extends BaseAppAuthentication
{
    private const SVG_DATA_URI = 'data:image/svg+xml;base64,';

    public function generateQrCodeDataUri(#[SensitiveParameter] string $secret): string
    {
        $uri = parent::generateQrCodeDataUri($secret);

        if (str_starts_with($uri, self::SVG_DATA_URI)) {
            $inner = base64_decode(substr($uri, strlen(self::SVG_DATA_URI)), true);

            if ($inner !== false && str_starts_with($inner, 'data:')) {
                return $inner;
            }
        }

        return $uri;
    }
}
