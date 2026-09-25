<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SinceRequest;
use App\Models\Profile;
use App\Services\SyncService;
use App\Support\ApiCaller;
use Illuminate\Http\JsonResponse;

class SyncController extends Controller
{
    public function __invoke(SinceRequest $request, SyncService $sync): JsonResponse
    {
        /** @var Profile $me */
        $me = ApiCaller::of($request);

        return response()->json($sync->build($me, $request->since()));
    }
}
