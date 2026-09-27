// What people and the phone do with reminders (docs/aster-reminders-location-plan.md §4): add,
// edit, Done, delete and Snooze, ringing arrive-home reminders on arrival and arming them on
// departure, and the notification's buttons. Every change updates the alarms and queues the upload.
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { queueEvents } from '@/features/location/uploads';
import type { ReminderTrigger } from '@/services/api/types';
import {
  ACTION_DONE,
  ACTION_SNOOZE,
  cancelAlarm,
  presentAlarm,
  setUpNotifications,
} from '@/services/notifications';
import { uuidV4 } from '@/services/uuid';

import {
  alarmContent,
  firedEvent,
  notificationLabels,
  reconcileAlarms,
  reminderOfAlarm,
  snoozeId,
} from './alarms';
import { apiTime } from './format';
import { dropReminderJobs, enqueueReminderJob } from './queue';
import {
  changeReminders,
  ensureRemindersLoaded,
  updateReminder,
  useRemindersStore,
  type LocalReminder,
} from './store';

export const SNOOZE_MS = 30 * 60 * 1000;

export type ReminderInput = { title: string; trigger: ReminderTrigger; dueAt: Date | null };

const store = () => useRemindersStore.getState();

/** Profiles that may have reminders (Laravel's EnsureCanUseReminders). */
export function canUseReminders(role: string | undefined): boolean {
  return role === 'owner' || role === 'member';
}

function sessionProfile() {
  const { session } = useFirstRunStore.getState();
  if (!isUnlocked(session) || !canUseReminders(session!.profile.role)) {
    throw new Error('No profile that may use reminders is unlocked');
  }
  return session!.profile;
}

/**
 * A new reminder for the unlocked profile; returns its client_uuid. `atHome`: made at home, an
 * arrive-home reminder waits for the phone to leave first.
 */
export async function addReminder(input: ReminderInput, atHome: boolean, now = new Date()) {
  const profile = sessionProfile();
  const clientUuid = uuidV4();
  const at = apiTime(now);
  const reminder: LocalReminder = {
    clientUuid,
    serverId: null,
    profileId: profile.id,
    profileName: profile.name,
    title: input.title.trim(),
    trigger: input.trigger,
    dueAt: input.trigger === 'time' && input.dueAt ? apiTime(input.dueAt) : null,
    status: 'pending',
    armed: input.trigger === 'arrive_home' && !atHome,
    firedAt: null,
    snoozedUntil: null,
    createdAt: at,
    updatedAt: at,
  };
  await changeReminders(({ reminders }) => ({
    reminders: { ...reminders, [clientUuid]: reminder },
  }));
  await enqueueReminderJob({ kind: 'create', reminder: clientUuid, profileId: profile.id });
  await reconcileAlarms();
  return clientUuid;
}

/** Changes title and when. A new time or trigger starts afresh (not rung, not snoozed). */
export async function editReminder(
  clientUuid: string,
  input: ReminderInput,
  atHome: boolean,
  now = new Date(),
) {
  const before = store().reminders[clientUuid];
  if (!before) return;
  const dueAt = input.trigger === 'time' && input.dueAt ? apiTime(input.dueAt) : null;
  const moved = dueAt !== before.dueAt || input.trigger !== before.trigger;
  await updateReminder(clientUuid, (r) => ({
    ...r,
    title: input.title.trim(),
    trigger: input.trigger,
    dueAt,
    ...(moved
      ? {
          firedAt: null,
          snoozedUntil: null,
          armed:
            input.trigger === 'arrive_home'
              ? r.trigger === 'arrive_home'
                ? r.armed
                : !atHome
              : false,
        }
      : {}),
    updatedAt: apiTime(now),
  }));
  await enqueueReminderJob({ kind: 'update', reminder: clientUuid, profileId: before.profileId });
  await reconcileAlarms();
}

/**
 * A time reminder that came due has rung, even if the app hasn't looked since: log it once
 * (reconcileAlarms does the same for reminders nobody touched).
 */
async function noteRang(reminder: LocalReminder, now: Date) {
  if (reminder.trigger !== 'time' || !reminder.dueAt) return;
  const due = Date.parse(reminder.dueAt);
  if (due > now.getTime() || (reminder.firedAt && Date.parse(reminder.firedAt) >= due)) return;
  await updateReminder(reminder.clientUuid, (r) => ({ ...r, firedAt: r.dueAt }));
  await queueEvents([firedEvent(reminder, new Date(due))]);
}

/** Done, from the editor or the notification: stops its alarms and tells Laravel. */
export async function markDone(clientUuid: string, now = new Date()) {
  await ensureRemindersLoaded();
  const reminder = store().reminders[clientUuid];
  if (!reminder || reminder.status !== 'pending') return;
  await noteRang(reminder, now);
  await updateReminder(clientUuid, (r) => ({
    ...r,
    status: 'done',
    snoozedUntil: null,
    updatedAt: apiTime(now),
  }));
  await cancelAlarm(clientUuid);
  await cancelAlarm(snoozeId(clientUuid));
  await enqueueReminderJob({ kind: 'update', reminder: clientUuid, profileId: reminder.profileId });
  await reconcileAlarms();
}

export async function deleteReminder(clientUuid: string) {
  const reminder = store().reminders[clientUuid];
  if (!reminder) return;
  await changeReminders(({ reminders }) => {
    const { [clientUuid]: _gone, ...rest } = reminders;
    return { reminders: rest };
  });
  await dropReminderJobs(clientUuid);
  await cancelAlarm(clientUuid);
  await cancelAlarm(snoozeId(clientUuid));
  if (reminder.serverId != null) {
    await enqueueReminderJob({
      kind: 'delete',
      reminder: clientUuid,
      profileId: reminder.profileId,
      serverId: reminder.serverId,
    });
  }
  await reconcileAlarms();
}

/** Snooze 30 min: rings again then; Laravel isn't told (decision 6). */
export async function snooze(clientUuid: string, now = new Date()) {
  await ensureRemindersLoaded();
  const reminder = store().reminders[clientUuid];
  if (!reminder || reminder.status !== 'pending') return;
  await noteRang(reminder, now);
  await cancelAlarm(clientUuid);
  await cancelAlarm(snoozeId(clientUuid));
  await updateReminder(clientUuid, (r) => ({
    ...r,
    snoozedUntil: apiTime(new Date(now.getTime() + SNOOZE_MS)),
  }));
  await reconcileAlarms();
}

/** Arrived home: every armed arrive-home reminder, of every profile, rings now, once. */
export async function ringArriveHome(now = new Date()) {
  await ensureRemindersLoaded();
  const due = Object.values(store().reminders).filter(
    (r) => r.status === 'pending' && r.trigger === 'arrive_home' && r.armed,
  );
  if (due.length === 0) return;
  await setUpNotifications(notificationLabels);
  await changeReminders(({ reminders }) => {
    const next = { ...reminders };
    for (const r of due) next[r.clientUuid] = { ...r, armed: false, firedAt: apiTime(now) };
    return { reminders: next };
  });
  for (const reminder of due) {
    await presentAlarm(reminder.clientUuid, alarmContent(reminder)).catch(() => {});
  }
  await queueEvents(due.map((reminder) => firedEvent(reminder, now)));
}

/** Left home: arrive-home reminders ring at the next arrival. */
export async function armArriveHome() {
  await changeReminders(({ reminders }) => {
    let changed = false;
    const next = { ...reminders };
    for (const r of Object.values(reminders)) {
      if (r.trigger !== 'arrive_home' || r.status !== 'pending' || r.armed) continue;
      next[r.clientUuid] = { ...r, armed: true };
      changed = true;
    }
    return changed ? { reminders: next } : {};
  });
}

/** What expo-notifications hands over for a tap or a button. */
export type AlarmResponse = {
  actionIdentifier: string;
  notification: { date?: number; request: { identifier: string; content: { data?: unknown } } };
};

// A button tapped while the app is in the background reaches both the background task and the
// response listener; the second one is ignored.
const handled = new Set<string>();

/**
 * Done or Snooze from the notification. Returns the reminder's client_uuid for a tap on the
 * notification itself, so the caller can open it; null otherwise.
 */
export async function handleAlarmResponse(response: AlarmResponse): Promise<string | null> {
  const { identifier, content } = response.notification.request;
  const data = (content.data ?? {}) as { reminder?: unknown };
  const clientUuid =
    typeof data.reminder === 'string' ? data.reminder : reminderOfAlarm(identifier);
  const key = `${identifier}|${response.actionIdentifier}|${response.notification.date ?? ''}`;
  if (handled.has(key)) return null;
  handled.add(key);

  if (response.actionIdentifier === ACTION_DONE) {
    await markDone(clientUuid);
    return null;
  }
  if (response.actionIdentifier === ACTION_SNOOZE) {
    await snooze(clientUuid);
    return null;
  }
  return clientUuid;
}

/** Tests only. */
export function resetHandledResponses() {
  handled.clear();
}
