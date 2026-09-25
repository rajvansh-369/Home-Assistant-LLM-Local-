<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateAlertSettingRequest;
use App\Http\Resources\AlertSettingResource;
use Illuminate\Http\Request;

class AlertSettingController extends Controller
{
    public function show(Request $request): AlertSettingResource
    {
        return new AlertSettingResource($this->household($request)->alertSettings()->firstOrCreate());
    }

    public function update(UpdateAlertSettingRequest $request): AlertSettingResource
    {
        $settings = $this->household($request)->alertSettings()->firstOrCreate();
        $settings->update($request->validated());

        return new AlertSettingResource($settings->refresh());
    }
}
