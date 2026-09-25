<?php

namespace App\Console\Commands;

use App\Models\Admin;
use App\Services\AdminAudit;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rules\Password;

/**
 * The only way to add a super admin. The password is asked for without
 * echoing it; the admin sets up an authenticator app at first sign-in.
 */
#[Signature('aster:create-admin {email : The admin\'s email address} {--name= : Display name (defaults to the part of the email before @)}')]
#[Description('Create a super admin for /admin')]
class CreateAdminCommand extends Command
{
    public function handle(): int
    {
        $email = strtolower(trim((string) $this->argument('email')));
        $name = trim((string) ($this->option('name') ?: strstr($email, '@', true)));

        $details = Validator::make(['email' => $email, 'name' => $name], [
            'email' => ['required', 'email', 'max:255', 'unique:admins,email'],
            'name' => ['required', 'string', 'max:255'],
        ]);
        if ($details->fails()) {
            $this->components->error($details->errors()->first());

            return self::FAILURE;
        }

        if (! $this->input->isInteractive()) {
            $this->components->error('Run this in a terminal: it asks for the password.');

            return self::FAILURE;
        }

        $password = (string) $this->secret('Password (at least 12 characters)');
        $passwordCheck = Validator::make(['password' => $password], ['password' => ['required', Password::min(12)]]);
        if ($passwordCheck->fails()) {
            $this->components->error($passwordCheck->errors()->first());

            return self::FAILURE;
        }
        if ((string) $this->secret('Password again') !== $password) {
            $this->components->error('The passwords don\'t match.');

            return self::FAILURE;
        }

        $admin = DB::transaction(function () use ($email, $name, $password) {
            $admin = Admin::create(['email' => $email, 'name' => $name, 'password' => $password, 'is_active' => true]);
            AdminAudit::record(AdminAudit::ADMIN_CREATED, null, $admin, ['via' => 'console'], admin: $admin);

            return $admin;
        });

        $this->components->info("Created admin {$admin->email}.");
        $this->components->bulletList([
            'Sign in at '.rtrim((string) config('app.url'), '/').'/admin',
            'You will set up an authenticator app first, and get recovery codes to keep somewhere safe.',
        ]);

        return self::SUCCESS;
    }
}
