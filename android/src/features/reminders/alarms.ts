// Alarms (docs/aster-reminders-location-plan.md §4 Ringing): one scheduled notification per
// pending time reminder (identifier = its client_uuid) and one per snooze (`{uuid}:snooze`). The
// store and Android's schedule are compared after every change and at launch, so edits, deletes,
// merges and lost alarms all end the same way.
import { queueEvents } from '@/features/location/uploads';
import type { ActivityEventBody } from '@/services/api/types';
import {
  cancelAlarm,
  scheduleAlarm,
  scheduledAlarmIds,
  setUpNotifications,
  type AlarmContent,
} from '@/services/notifications';
import { uuidV4 } from '@/services/uuid';

import { reminders as copy } from './copy';
import { apiTime, clock12 } from './format';
import {
  changeReminders,
  ensureRemindersLoaded,
  useRemindersStore,
  type LocalReminder,
} from './store';

export const SNOOZE_SUFFIX = ':snooze';

export const snoozeId = (clientUuid: string) => `${clientUuid}${SNOOZE_SUFFIX}`;

/** The reminder an alarm identifier belongs to. */
export const reminderOfAlarm = (identifier: string) =>
  identifier.endsWith(SNOOZE_SUFFIX) ? identifier.slice(0, -SNOOZE_SUFFIX.length) : identifier;

export const notificationLabels = {
  channel: copy.notification.channel,
  done: copy.notification.done,
  snooze: copy.notification.snooze,
};

/** What the notification says. */
export function alarmContent(reminder: LocalReminder): AlarmContent {
  const body =
    reminder.trigger === 'arrive_home' || reminder.dueAt == null
      ? copy.notification.arriveBody
      : copy.notification.timeBody(clock12(new Date(reminder.dueAt)));
  return {
    title: reminder.title,
    body,
    subtitle: reminder.profileName,
    data: { reminder: reminder.clientUuid },
  };
}

/** The alarms the store wants: identifier → ISO time. */
export function alarmPlan(reminders: Record<string, LocalReminder>, now: number) {
  const plan: Record<string, string> = {};
  for (const reminder of Object.values(reminders)) {
    if (reminder.status !== 'pending') continue;
    if (reminder.trigger === 'time' && reminder.dueAt && Date.parse(reminder.dueAt) > now) {
      plan[reminder.clientUuid] = reminder.dueAt;
    }
    if (reminder.snoozedUntil && Date.parse(reminder.snoozedUntil) > now) {
      plan[snoozeId(reminder.clientUuid)] = reminder.snoozedUntil;
    }
  }
  return plan;
}

/** `reminder_fired` for Laravel's activity log: the trigger, never the title. */
export function firedEvent(reminder: LocalReminder, at: Date): ActivityEventBody {
  return {
    client_uuid: uuidV4(),
    profile_id: reminder.profileId,
    type: 'reminder_fired',
    summary: copy.activity.fired,
    meta: { trigger: reminder.trigger },
    occurred_at: apiTime(at),
  };
}

let reconciling: Promise<void> | null = null;
let rerun = false;

/**
 * Schedules what's missing or moved, cancels what's no longer wanted, and records time reminders
 * whose alarm has rung since the last look (Android rings them without the app).
 */
export function reconcileAlarms(now = Date.now): Promise<void> {
  if (reconciling) {
    rerun = true;
    return reconciling;
  }
  reconciling = (async () => {
    try {
      do {
        rerun = false;
        await reconcileOnce(now());
      } while (rerun);
    } finally {
      reconciling = null;
    }
  })();
  return reconciling;
}

async function reconcileOnce(now: number) {
  await ensureRemindersLoaded();
  await setUpNotifications(notificationLabels);

  // Time reminders that came due: they rang (or rang while the phone was off).
  const rang: ActivityEventBody[] = [];
  await changeReminders(({ reminders }) => {
    let changed = false;
    const next = { ...reminders };
    for (const reminder of Object.values(reminders)) {
      if (reminder.status !== 'pending' || reminder.trigger !== 'time' || !reminder.dueAt) continue;
      const due = Date.parse(reminder.dueAt);
      if (due > now || (reminder.firedAt && Date.parse(reminder.firedAt) >= due)) continue;
      next[reminder.clientUuid] = { ...reminder, firedAt: reminder.dueAt };
      rang.push(firedEvent(reminder, new Date(due)));
      changed = true;
    }
    return changed ? { reminders: next } : {};
  });
  if (rang.length > 0) await queueEvents(rang);

  const { reminders, alarms } = useRemindersStore.getState();
  const plan = alarmPlan(reminders, now);
  const live = new Set(await scheduledAlarmIds().catch(() => [] as string[]));

  for (const identifier of Object.keys(alarms)) {
    if (identifier in plan) continue;
    const reminder = reminders[reminderOfAlarm(identifier)];
    // Gone or finished: stop it and take it off the tray. Merely past: it rang, leave it shown.
    if (!reminder || reminder.status !== 'pending') await cancelAlarm(identifier);
  }
  for (const [identifier, at] of Object.entries(plan)) {
    if (alarms[identifier] === at && live.has(identifier)) continue;
    const reminder = reminders[reminderOfAlarm(identifier)];
    await scheduleAlarm(identifier, alarmContent(reminder), new Date(at));
  }
  await changeReminders(() => ({ alarms: plan }));
}

/** Tests only. */
export function resetAlarmsRuntime() {
  reconciling = null;
  rerun = false;
}
