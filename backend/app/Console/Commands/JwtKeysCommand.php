<?php

namespace App\Console\Commands;

use App\Support\JwtKeys;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

#[Signature('aster:jwt-keys {--force : Replace an existing key pair}')]
#[Description('Create the RSA key pair that signs llm_tokens')]
class JwtKeysCommand extends Command
{
    public function handle(): int
    {
        $private = JwtKeys::privatePath();
        $public = JwtKeys::publicPath();

        if ((File::exists($private) || File::exists($public)) && ! $this->option('force')) {
            $this->components->error('A key pair already exists. Replacing it makes every issued llm_token fail on the home PCs; use --force if you mean it.');

            return self::FAILURE;
        }

        $keys = JwtKeys::generate();

        File::ensureDirectoryExists(dirname($private));
        File::ensureDirectoryExists(dirname($public));
        File::put($private, $keys['private']);
        File::put($public, $keys['public']);
        @chmod($private, 0600); // No effect on Windows.

        $this->components->info('Created the llm_token key pair.');
        $this->components->twoColumnDetail('Private key (never leaves this server)', $private);
        $this->components->twoColumnDetail('Public key (copy to each home PC)', $public);

        return self::SUCCESS;
    }
}
