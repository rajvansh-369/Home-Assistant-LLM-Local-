<?php

namespace App\Enums;

enum AuthEventType: string
{
    case Register = 'register';
    case Login = 'login';
    case LoginFailed = 'login_failed';
    case Logout = 'logout';
    case Unlock = 'unlock';
    case UnlockFailed = 'unlock_failed';
    case Lockout = 'lockout';
    case GuestSession = 'guest_session';
}
