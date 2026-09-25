<?php

namespace App\Enums;

enum Sampling: string
{
    case Auto = 'auto';
    case Precise = 'precise';
    case Balanced = 'balanced';
    case Creative = 'creative';
}
