<?php

namespace App\Http\Controllers\Api;

use App\Enums\ReminderTrigger;
use App\Http\Controllers\Controller;
use App\Http\Middleware\EnsureCanUseReminders;
use App\Http\Requests\ReminderRequest;
use App\Http\Resources\ReminderResource;
use App\Models\Profile;
use App\Models\Reminder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Routing\Controllers\HasMiddleware;
use Illuminate\Routing\Controllers\Middleware;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * The unlocked profile's reminders (§5). The phone schedules the alarms.
 */
class ReminderController extends Controller implements HasMiddleware
{
    public static function middleware(): array
    {
        return [new Middleware(EnsureCanUseReminders::class)];
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        return ReminderResource::collection($this->profile($request)->reminders()->orderBy('id')->get());
    }

    /**
     * Idempotent by client_uuid: 201 when new, 200 when the phone retries.
     */
    public function store(ReminderRequest $request): JsonResponse
    {
        $profile = $this->profile($request);
        $fields = $this->fields($request);
        $this->ensureDueAt($fields['trigger'], $fields['due_at'] ?? null);

        $existing = $this->existing($profile, $request->validated('client_uuid'));
        if ($existing !== null) {
            return (new ReminderResource($existing))->response();
        }

        try {
            $reminder = $profile->reminders()->create(['client_uuid' => $request->validated('client_uuid'), ...$fields]);
        } catch (UniqueConstraintViolationException) {
            return (new ReminderResource($this->existing($profile, $request->validated('client_uuid'))))->response();
        }

        return (new ReminderResource($reminder->refresh()))->response()->setStatusCode(201);
    }

    public function update(ReminderRequest $request, Reminder $reminder): ReminderResource
    {
        $reminder->fill($this->fields($request));
        $this->ensureDueAt($reminder->trigger, $reminder->due_at);
        $reminder->save();

        return new ReminderResource($reminder);
    }

    public function destroy(Reminder $reminder): Response
    {
        $reminder->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function fields(ReminderRequest $request): array
    {
        $fields = $request->safe()->only(['title', 'trigger', 'due_at', 'status']);

        if (isset($fields['due_at'])) {
            $fields['due_at'] = Carbon::parse($fields['due_at'])->utc();
        }

        return $fields;
    }

    private function ensureDueAt(ReminderTrigger|string|null $trigger, mixed $dueAt): void
    {
        $trigger = is_string($trigger) ? ReminderTrigger::from($trigger) : $trigger;

        if ($trigger === ReminderTrigger::Time && $dueAt === null) {
            throw ValidationException::withMessages(['due_at' => 'A time reminder needs a due_at.']);
        }
    }

    private function existing(Profile $profile, string $clientUuid): ?Reminder
    {
        $reminder = Reminder::withTrashed()->where('client_uuid', $clientUuid)->first();

        if ($reminder !== null && ($reminder->profile_id !== $profile->id || $reminder->trashed())) {
            throw ValidationException::withMessages([
                'client_uuid' => $reminder->trashed() && $reminder->profile_id === $profile->id
                    ? 'This reminder was deleted.'
                    : 'This client_uuid is already in use.',
            ]);
        }

        return $reminder;
    }
}
