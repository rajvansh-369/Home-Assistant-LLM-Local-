<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateLocationSettingRequest;
use App\Http\Resources\LocationSettingResource;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class LocationSettingController extends Controller
{
    public function show(Request $request): LocationSettingResource
    {
        return new LocationSettingResource($this->household($request)->locationSettings()->firstOrCreate());
    }

    public function update(UpdateLocationSettingRequest $request): LocationSettingResource
    {
        $settings = $this->household($request)->locationSettings()->firstOrCreate();
        $changes = $request->validated();

        if (array_key_exists('paused_until', $changes) && $changes['paused_until'] !== null) {
            $changes['paused_until'] = Carbon::parse($changes['paused_until'])->utc();
        }

        $settings->update($changes);

        return new LocationSettingResource($settings);
    }
}
