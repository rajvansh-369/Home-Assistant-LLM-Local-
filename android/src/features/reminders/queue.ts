// Reminder uploads (docs/aster-reminders-location-plan.md §4 Laravel), like the chat queue: jobs
// need their profile's token, so they run only while that profile is unlocked, in order per
// reminder, backing off 5 s, 30 s, 2 min, then every 5 min. 422, 403 and 404 drop the job (it
// would never succeed); 401 stops the run (the lock flow takes over).
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { api, ApiError } from '@/services/api';
import type { CreateReminderBody } from '@/services/api/types';
import { uuidV4 } from '@/services/uuid';

import { changeReminders, useRemindersStore, type LocalReminder, type ReminderJob } from './store';

export const BACKOFF_MS = [5_000, 30_000, 120_000, 300_000];

const store = () => useRemindersStore.getState();

type NewJob =
  | { kind: 'create'; reminder: string; profileId: number }
  | { kind: 'update'; reminder: string; profileId: number }
  | { kind: 'delete'; reminder: string; profileId: number; serverId: number };

/**
 * Queues a job and tries to send it. An `update` already waiting for the same reminder covers the
 * new one (it sends the fields as they are when it runs).
 */
export async function enqueueReminderJob(job: NewJob) {
  await changeReminders(({ queue }) => {
    const waiting = queue.some(
      (j) => j.kind === 'update' && job.kind === 'update' && j.reminder === job.reminder,
    );
    if (waiting) return {};
    return { queue: [...queue, { ...job, id: uuidV4(), attempts: 0, nextAt: 0 } as ReminderJob] };
  });
  void flushReminderQueue();
}

/** Drops every job of a reminder, e.g. one deleted before it was ever uploaded. */
export function dropReminderJobs(clientUuid: string) {
  return changeReminders(({ queue }) => ({
    queue: queue.filter((j) => j.reminder !== clientUuid),
  }));
}

export const hasJobs = (queue: ReminderJob[], clientUuid: string) =>
  queue.some((job) => job.reminder === clientUuid);

/** What Laravel gets for a reminder. */
export function reminderBody(reminder: LocalReminder): Omit<CreateReminderBody, 'client_uuid'> {
  return {
    title: reminder.title,
    trigger: reminder.trigger,
    due_at: reminder.trigger === 'time' ? reminder.dueAt : null,
    status: reminder.status,
  };
}

class Wait extends Error {}

async function run(job: ReminderJob, server: string, token: string) {
  const reminder = store().reminders[job.reminder];
  switch (job.kind) {
    case 'create': {
      if (!reminder || reminder.serverId != null) return;
      const created = await api.createReminder(server, token, {
        client_uuid: reminder.clientUuid,
        ...reminderBody(reminder),
      });
      // Deleted on the phone while this was on its way: delete it on Laravel too.
      if (!store().reminders[job.reminder]) {
        await api.deleteReminder(server, token, created.id).catch(() => {});
        return;
      }
      await setServerId(job.reminder, created.id);
      return;
    }
    case 'update': {
      if (!reminder) return;
      if (reminder.serverId == null) throw new Wait();
      await api.updateReminder(server, token, reminder.serverId, reminderBody(reminder));
      return;
    }
    case 'delete':
      try {
        await api.deleteReminder(server, token, job.serverId);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
  }
}

function setServerId(clientUuid: string, serverId: number) {
  return changeReminders(({ reminders }) => {
    const reminder = reminders[clientUuid];
    return reminder ? { reminders: { ...reminders, [clientUuid]: { ...reminder, serverId } } } : {};
  });
}

/** Done or cancelled, uploaded and nothing left to send: the phone has no more use for it. */
function forgetFinished(clientUuid: string) {
  return changeReminders(({ reminders, queue }) => {
    const reminder = reminders[clientUuid];
    if (!reminder || reminder.status === 'pending' || hasJobs(queue, clientUuid)) return {};
    const { [clientUuid]: _gone, ...rest } = reminders;
    return { reminders: rest };
  });
}

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function scheduleNext() {
  clearTimeout(timer);
  const { session } = useFirstRunStore.getState();
  const mine = store().queue.filter((job) => job.profileId === session?.profile.id);
  if (mine.length === 0) return;
  const next = Math.min(...mine.map((job) => job.nextAt));
  timer = setTimeout(() => void flushReminderQueue(), Math.max(1_000, next - Date.now()));
}

/** Sends the unlocked profile's due jobs, in order. Other profiles' jobs wait for their unlock. */
export async function flushReminderQueue(now = Date.now) {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    const { session, serverUrl } = useFirstRunStore.getState();
    if (!serverUrl || !isUnlocked(session)) return;
    const profileId = session!.profile.id;

    const blocked = new Set<string>();
    for (const job of [...store().queue]) {
      if (job.profileId !== profileId) continue;
      if (blocked.has(job.reminder) || job.nextAt > now()) {
        blocked.add(job.reminder);
        continue;
      }
      try {
        await run(job, serverUrl, session!.profileToken);
        await changeReminders(({ queue }) => ({ queue: queue.filter((j) => j.id !== job.id) }));
        await forgetFinished(job.reminder);
      } catch (error) {
        if (error instanceof Wait) {
          blocked.add(job.reminder);
          continue;
        }
        const status = error instanceof ApiError ? error.status : -1;
        if (status === 401) break;
        const hopeless = status === 422 || status === 404 || status === 403;
        await changeReminders(({ queue }) => ({
          queue: hopeless
            ? queue.filter((j) => j.id !== job.id)
            : queue.map((j) =>
                j.id === job.id
                  ? {
                      ...j,
                      attempts: j.attempts + 1,
                      nextAt: now() + BACKOFF_MS[Math.min(j.attempts, BACKOFF_MS.length - 1)],
                      lastError: error instanceof Error ? error.message : String(error),
                    }
                  : j,
              ),
        }));
        if (hopeless) await forgetFinished(job.reminder);
        blocked.add(job.reminder);
      }
    }
  } finally {
    running = false;
    scheduleNext();
    if (again) {
      again = false;
      void flushReminderQueue(now);
    }
  }
}

/** Tests only. */
export function resetReminderQueueRunner() {
  clearTimeout(timer);
  running = false;
  again = false;
}
