<?php

namespace App\Enums;

/**
 * Who answers a profile's chats on the home PC. zypherLL takes the value as
 * its `engine`: "local" is Zephyr on the PC's GPU, "markl" is Mark-L on
 * Gemini. The name the app shows for each is set in the admin panel.
 */
enum LlmEngine: string
{
    case Local = 'local';
    case Markl = 'markl';

    /** The name shown until the admin panel sets one. */
    public function defaultName(): string
    {
        return match ($this) {
            self::Local => 'Local',
            self::Markl => 'Mark-L',
        };
    }
}
