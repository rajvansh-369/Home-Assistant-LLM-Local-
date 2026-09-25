<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateHomeRequest;
use App\Http\Resources\PlaceResource;
use App\Models\Place;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The household's Home place, the row named "Home" (§3, §5).
 */
class PlaceController extends Controller
{
    public function show(Request $request): PlaceResource
    {
        $home = $this->household($request)->home;

        abort_if($home === null, 404, 'No home is saved yet.');

        return new PlaceResource($home);
    }

    /**
     * Creates or replaces the home. Always 200, as §5 says, even on the first save.
     */
    public function update(UpdateHomeRequest $request): JsonResponse
    {
        $home = $this->household($request)->places()->firstOrNew(['name' => Place::HOME]);
        $home->fill($request->validated())->save();

        return (new PlaceResource($home))->response()->setStatusCode(200);
    }
}
