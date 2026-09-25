<?php

namespace App\Enums;

enum MessageSource: string
{
    case Whatsapp = 'whatsapp';
    case GoogleChat = 'google_chat';
    case Sms = 'sms';
}
