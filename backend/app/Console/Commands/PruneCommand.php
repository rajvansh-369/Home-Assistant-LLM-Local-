<?php

namespace App\Console\Commands;

use App\Models\ActivityLog;
use App\Models\AdminAuditLog;
use App\Models\AuthEvent;
use App\Models\Conversation;
use App\Models\DeviceActivityDay;
use App\Models\Location;
use App\Models\LocationSetting;
use App\Models\Profile;
use App\Models\Reminder;
use App\Models\VipContact;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * The Retention table in docs/aster-backend-plan.md §3. Runs daily at 02:30.
 */
#[Signature('aster:prune')]
#[Description('Delete data past its retention period')]
class PruneCommand extends Command
{
    public const LOG_DAYS = 90;

    public const ACTIVITY_DAY_DAYS = 400;

    public const AUDIT_DAYS = 365;

    public const SOFT_DELETE_DAYS = 30;

    public const DEFAULT_LOCATION_DAYS = 30;

    public function handle(): int
    {
        $now = now();

        $counts = [
            'locations' => $this->pruneLocations(),
            'activity_logs' => ActivityLog::query()->where('occurred_at', '<', $now->copy()->subDays(self::LOG_DAYS))->delete(),
            'auth_events' => AuthEvent::query()->where('created_at', '<', $now->copy()->subDays(self::LOG_DAYS))->delete(),
            'device_activity_days' => DeviceActivityDay::query()
                ->where('day', '<', $now->copy()->setTimezone(config('aster.admin.timezone'))->subDays(self::ACTIVITY_DAY_DAYS)->toDateString())
                ->delete(),
            'admin_audit_logs' => AdminAuditLog::query()->where('created_at', '<', $now->copy()->subDays(self::AUDIT_DAYS))->delete(),
        ];

        // Soft-deleted rows and conversation tombstones. Profiles last: force-deleting
        // one cascades to its conversations and reminders in the database.
        $cutoff = $now->copy()->subDays(self::SOFT_DELETE_DAYS);
        foreach (['conversations' => Conversation::class, 'reminders' => Reminder::class, 'vip_contacts' => VipContact::class, 'profiles' => Profile::class] as $table => $model) {
            $counts["deleted {$table}"] = $model::onlyTrashed()->where('deleted_at', '<', $cutoff)->forceDelete();
        }

        foreach ($counts as $what => $count) {
            $this->components->twoColumnDetail($what, (string) $count);
        }

        return self::SUCCESS;
    }

    /**
     * Each household keeps its own number of days (location_settings.retention_days).
     */
    private function pruneLocations(): int
    {
        $deleted = 0;

        LocationSetting::query()->select(['id', 'user_id', 'retention_days'])->lazyById(500)
            ->each(function (LocationSetting $settings) use (&$deleted) {
                $deleted += Location::query()
                    ->where('user_id', $settings->user_id)
                    ->where('recorded_at', '<', now()->subDays($settings->retention_days ?: self::DEFAULT_LOCATION_DAYS))
                    ->delete();
            });

        return $deleted;
    }
}
