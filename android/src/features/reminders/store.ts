// Every profile's reminders on this phone, their upload jobs and the alarms scheduled for them
// (docs/aster-reminders-location-plan.md §2, §4). One AsyncStorage key for all profiles: alarms
// ring whoever is unlocked. The store loads itself on first use, so the headless tasks (geofence,
// notification actions) change it the same way screens do; saves are chained, never interleaved.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { ReminderStatus, ReminderTrigger } from '@/services/api/types';

export const REMINDERS_KEY = 'aster.reminders';

export type LocalReminder = {
  clientUuid: string;
  /** Laravel's id once uploaded. */
  serverId: number | null;
  profileId: number;
  /** Shown on the notification, since any profile's reminder may ring. */
  profileName: string;
  title: string;
  trigger: ReminderTrigger;
  /** ISO time; time reminders only. */
  dueAt: string | null;
  status: ReminderStatus;
  /**
   * Arrive-home only: rings at the next arrival. A reminder made at home waits until the phone has
   * left; ringing disarms it until the next departure.
   */
  armed: boolean;
  /** When it last rang: the due time, or the arrival. */
  firedAt: string | null;
  /** A snoozed ring waits until then. */
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Upload jobs; `update` sends the reminder's fields as they are when it runs. */
export type ReminderJob = {
  id: string;
  reminder: string;
  profileId: number;
  attempts: number;
  nextAt: number;
  lastError?: string;
} & ({ kind: 'create' } | { kind: 'update' } | { kind: 'delete'; serverId: number });

export type SavedReminders = {
  reminders: Record<string, LocalReminder>;
  queue: ReminderJob[];
  /** Alarm identifier → the ISO time it's scheduled for, as last scheduled. */
  alarms: Record<string, string>;
};

type RemindersStore = SavedReminders & {
  loaded: boolean;
  set: (patch: Partial<SavedReminders & { loaded: boolean }>) => void;
};

const empty = (): SavedReminders => ({ reminders: {}, queue: [], alarms: {} });

export const useRemindersStore = create<RemindersStore>()((set) => ({
  ...empty(),
  loaded: false,
  set: (patch) => set(patch),
}));

const store = () => useRemindersStore.getState();

let loading: Promise<void> | null = null;

/** Reads the saved reminders once per JS runtime. A broken copy starts empty. */
export function ensureRemindersLoaded(): Promise<void> {
  loading ??= (async () => {
    let saved = empty();
    try {
      const raw = await AsyncStorage.getItem(REMINDERS_KEY);
      if (raw) saved = { ...saved, ...(JSON.parse(raw) as Partial<SavedReminders>) };
    } catch {
      // Laravel still has the uploaded reminders; the next sync brings them back.
    }
    store().set({ ...saved, loaded: true });
  })();
  return loading;
}

let saving: Promise<void> = Promise.resolve();

/** Writes the current state after any write already on its way. */
export function saveReminders(): Promise<void> {
  saving = saving
    .then(() => {
      const { reminders, queue, alarms } = store();
      return AsyncStorage.setItem(
        REMINDERS_KEY,
        JSON.stringify({ reminders, queue, alarms } satisfies SavedReminders),
      );
    })
    .catch(() => {});
  return saving;
}

/** Loads if needed, applies `change` to the saved slice and saves. */
export async function changeReminders(
  change: (saved: SavedReminders) => Partial<SavedReminders>,
): Promise<void> {
  await ensureRemindersLoaded();
  const { reminders, queue, alarms } = store();
  store().set(change({ reminders, queue, alarms }));
  await saveReminders();
}

/** Replaces one reminder (by its client_uuid) with `change(reminder)`; no-op when it's gone. */
export function updateReminder(clientUuid: string, change: (r: LocalReminder) => LocalReminder) {
  return changeReminders(({ reminders }) => {
    const reminder = reminders[clientUuid];
    return reminder ? { reminders: { ...reminders, [clientUuid]: change(reminder) } } : {};
  });
}

export const remindersOf = (reminders: Record<string, LocalReminder>, profileId: number) =>
  Object.values(reminders).filter((r) => r.profileId === profileId);

/** Sign-out and reset: forget everything (the caller cancels alarms first). */
export async function clearReminders() {
  store().set({ ...empty(), loaded: true });
  loading = Promise.resolve();
  await AsyncStorage.removeItem(REMINDERS_KEY);
}

/** Tests only: as if the app had just started. */
export function resetRemindersRuntime() {
  loading = null;
  saving = Promise.resolve();
  store().set({ ...empty(), loaded: false });
}
