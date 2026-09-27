<?php

namespace App\Filament\Pages\Auth;

use Database\Seeders\DemoSeeder;
use Filament\Auth\Pages\Login as BaseLogin;

/**
 * The /admin sign-in form. Locally it comes filled in with the demo
 * admin's credentials, so signing in after a fresh seed is one click.
 */
class Login extends BaseLogin
{
    public function mount(): void
    {
        parent::mount();

        if (app()->isLocal()) {
            $this->form->fill([
                'email' => DemoSeeder::ADMIN_EMAIL,
                'password' => DemoSeeder::ADMIN_PASSWORD,
            ]);
        }
    }
}
