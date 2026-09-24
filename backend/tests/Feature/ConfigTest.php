<?php

it('reads the Aster settings with the plan defaults', function () {
    expect(config('aster.registration'))->toBeIn(['open', 'single'])
        ->and(config('aster.jwt.issuer'))->toBe('aster')
        ->and(config('aster.token_hours'))->toBe(12)
        ->and(config('aster.admin.allowed_ips'))->toBeArray();
});
