<?php

namespace App\Enums;

enum ProfileRole: string
{
    case Owner = 'owner';
    case Member = 'member';
    case Restricted = 'restricted';
    case Guest = 'guest';

    /**
     * Whether llm_tokens for this role may carry the profile's web_mode.
     */
    public function allowsWeb(): bool
    {
        return in_array($this, [self::Owner, self::Member], true);
    }
}
