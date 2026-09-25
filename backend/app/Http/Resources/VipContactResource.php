<?php

namespace App\Http\Resources;

use App\Models\VipContact;
use App\Support\ApiTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin VipContact
 */
class VipContactResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'match_key' => $this->match_key,
            'sources' => $this->sources,
            'enabled' => $this->enabled,
            'updated_at' => ApiTime::format($this->updated_at),
        ];
    }
}
