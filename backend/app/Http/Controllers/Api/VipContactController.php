<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\VipContactRequest;
use App\Http\Resources\VipContactResource;
use App\Models\VipContact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * The people whose messages the phone reads out (§5). Deletes are soft so
 * sync can tell other phones.
 */
class VipContactController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return VipContactResource::collection($this->household($request)->vipContacts()->orderBy('id')->get());
    }

    public function store(VipContactRequest $request): JsonResponse
    {
        $contact = $this->household($request)->vipContacts()->create([
            'enabled' => true,
            ...$request->validated(),
        ]);

        return (new VipContactResource($contact))->response()->setStatusCode(201);
    }

    public function update(VipContactRequest $request, VipContact $vipContact): VipContactResource
    {
        $vipContact->update($request->validated());

        return new VipContactResource($vipContact);
    }

    public function destroy(VipContact $vipContact): Response
    {
        $vipContact->delete();

        return response()->noContent();
    }
}
