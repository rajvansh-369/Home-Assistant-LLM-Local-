<?php

namespace App\Models;

use Database\Factories\VipContactFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * match_key is the sender name as it appears in notifications. sources is a
 * list of MessageSource values.
 *
 * @property list<string> $sources
 */
#[Fillable(['name', 'match_key', 'sources', 'enabled'])]
class VipContact extends Model
{
    /** @use HasFactory<VipContactFactory> */
    use HasFactory, SoftDeletes;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'sources' => 'array',
            'enabled' => 'boolean',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
