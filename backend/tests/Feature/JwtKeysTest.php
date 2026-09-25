<?php

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Support\Facades\File;
use Tests\Support\JwtFixture;

describe('aster:jwt-keys', function () {
    beforeEach(function () {
        $this->dir = storage_path('framework/testing/jwt-'.uniqid());
        config([
            'aster.jwt.private_key' => $this->dir.'/aster-jwt.key',
            'aster.jwt.public_key' => $this->dir.'/aster-jwt.pub',
        ]);
    });

    afterEach(fn () => File::deleteDirectory($this->dir));

    it('creates a working 2048-bit key pair', function () {
        $this->artisan('aster:jwt-keys')->assertSuccessful();

        $private = File::get($this->dir.'/aster-jwt.key');
        $public = File::get($this->dir.'/aster-jwt.pub');
        $token = JWT::encode(['sub' => 'x'], $private, 'RS256');

        expect(openssl_pkey_get_details(openssl_pkey_get_private($private))['bits'])->toBe(2048)
            ->and(JWT::decode($token, new Key($public, 'RS256'))->sub)->toBe('x');
    });

    it('refuses to overwrite without --force', function () {
        $this->artisan('aster:jwt-keys')->assertSuccessful();
        $before = File::get($this->dir.'/aster-jwt.key');

        $this->artisan('aster:jwt-keys')->assertFailed();
        expect(File::get($this->dir.'/aster-jwt.key'))->toBe($before);

        $this->artisan('aster:jwt-keys --force')->assertSuccessful();
        expect(File::get($this->dir.'/aster-jwt.key'))->not->toBe($before);
    });
});

describe('the llm/ fixture', function () {
    it('holds a sample token that verifies with the test public key', function () {
        if (getenv('ASTER_REBUILD_JWT_FIXTURE')) {
            JwtFixture::build();
        }

        $token = trim(File::get(JwtFixture::tokenPath()));
        $claims = json_decode(File::get(JwtFixture::claimsPath()), true);

        expect((array) JWT::decode($token, new Key(File::get(JwtFixture::publicKeyPath()), 'RS256')))->toBe($claims)
            ->and($claims)->toBe(JwtFixture::claims());
    });

    it('is not the real key pair', function () {
        $real = base_path('storage/keys/aster-jwt.pub');

        expect(File::exists($real) && File::get($real) === File::get(JwtFixture::publicKeyPath()))->toBeFalse();
    });
});
