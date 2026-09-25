<?php

namespace App\Services;

use App\Models\Admin;
use App\Models\AdminAuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use LogicException;

/**
 * Writes the admin audit log (§6). Every reveal of chat text or a location
 * trail, and every suspend, revoke and admin change, goes through here.
 */
class AdminAudit
{
    public const MESSAGES_VIEWED = 'messages.viewed';

    public const LOCATIONS_VIEWED = 'locations.viewed';

    public const HOUSEHOLD_SUSPENDED = 'household.suspended';

    public const HOUSEHOLD_UNSUSPENDED = 'household.unsuspended';

    public const DEVICE_REVOKED = 'device.revoked';

    public const ADMIN_CREATED = 'admin.created';

    public const ADMIN_DEACTIVATED = 'admin.deactivated';

    public const ADMIN_REACTIVATED = 'admin.reactivated';

    public const ACTIONS = [
        self::MESSAGES_VIEWED, self::LOCATIONS_VIEWED, self::HOUSEHOLD_SUSPENDED, self::HOUSEHOLD_UNSUSPENDED,
        self::DEVICE_REVOKED, self::ADMIN_CREATED, self::ADMIN_DEACTIVATED, self::ADMIN_REACTIVATED,
    ];

    /**
     * @param  array<string, mixed>  $meta  ids, dates and reasons; never chat text or coordinates
     * @param  Admin|null  $admin  the signed-in admin unless given (the console passes one)
     */
    public static function record(string $action, ?User $household, ?Model $subject = null, array $meta = [], ?Admin $admin = null): AdminAuditLog
    {
        $admin ??= Auth::guard('admin')->user();

        if (! $admin instanceof Admin) {
            throw new LogicException('An audit entry needs an admin.');
        }

        $request = request();

        return AdminAuditLog::create([
            'admin_id' => $admin->id,
            'action' => $action,
            'user_id' => $household?->id,
            'subject_type' => $subject?->getMorphClass(),
            'subject_id' => $subject?->getKey(),
            'meta' => $meta,
            'ip' => app()->runningInConsole() && ! app()->runningUnitTests() ? null : $request->ip(),
            'user_agent' => app()->runningInConsole() && ! app()->runningUnitTests() ? 'console' : substr((string) $request->userAgent(), 0, 1000),
        ]);
    }
}
