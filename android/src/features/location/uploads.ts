// The device queue (docs/aster-reminders-location-plan.md §5 Uploading): location points and
// activity events waiting for Laravel. Both batches take the device token, which lives in
// SecureStore, so they go out from the headless tasks too, whoever is unlocked. Every item has a
// client_uuid, so a batch that failed half-way is simply sent again.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useFirstRunStore } from '@/features/first-run/store';
import { api, ApiError } from '@/services/api';
import type { ActivityEventBody, LocationPointBody } from '@/services/api/types';
import { getDeviceToken } from '@/services/secure';

export const DEVICE_UPLOADS_KEY = 'aster.device-uploads';
export const MAX_POINTS = 5_000;
export const MAX_EVENTS = 1_000;
export const BATCH_SIZE = 500;

export type DeviceUploads = {
  points: LocationPointBody[];
  events: ActivityEventBody[];
  /** Why the last batch was dropped (422) or failed, for the dev facts. Never content. */
  lastError: string | null;
  lastSentAt: string | null;
};

const empty = (): DeviceUploads => ({ points: [], events: [], lastError: null, lastSentAt: null });

let state: DeviceUploads = empty();
let loading: Promise<void> | null = null;
let saving: Promise<void> = Promise.resolve();
const listeners = new Set<(uploads: DeviceUploads) => void>();

function ensureLoaded(): Promise<void> {
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(DEVICE_UPLOADS_KEY);
      if (raw) state = { ...empty(), ...(JSON.parse(raw) as Partial<DeviceUploads>) };
    } catch {
      // A broken queue starts empty; those points are lost, the next ones aren't.
    }
  })();
  return loading;
}

function commit(next: DeviceUploads): Promise<void> {
  state = next;
  listeners.forEach((listener) => listener(state));
  saving = saving
    .then(() => AsyncStorage.setItem(DEVICE_UPLOADS_KEY, JSON.stringify(state)))
    .catch(() => {});
  return saving;
}

/** What's waiting, e.g. for 5.3's "points waiting to upload". */
export async function readDeviceUploads(): Promise<DeviceUploads> {
  await ensureLoaded();
  return state;
}

/** Called after every change while this runtime is alive. Returns an unsubscribe. */
export function onDeviceUploads(listener: (uploads: DeviceUploads) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Adds points (oldest dropped past MAX_POINTS) and tries to send them. */
export async function queuePoints(points: LocationPointBody[]) {
  await ensureLoaded();
  await commit({ ...state, points: [...state.points, ...points].slice(-MAX_POINTS) });
  void flushDeviceUploads();
}

/** Adds activity events (oldest dropped past MAX_EVENTS) and tries to send them. */
export async function queueEvents(events: ActivityEventBody[]) {
  await ensureLoaded();
  await commit({ ...state, events: [...state.events, ...events].slice(-MAX_EVENTS) });
  void flushDeviceUploads();
}

/** The Laravel address, also in a headless task where nothing has loaded the first-run store. */
async function serverUrl(): Promise<string | null> {
  const persist = useFirstRunStore.persist;
  if (!persist.hasHydrated()) await persist.rehydrate();
  return useFirstRunStore.getState().serverUrl;
}

type Outcome = 'sent' | 'dropped' | 'stop';

async function sendBatch<T extends { client_uuid: string }>(
  items: T[],
  send: (batch: T[]) => Promise<unknown>,
  remove: (sent: Set<string>) => DeviceUploads,
): Promise<Outcome> {
  const batch = items.slice(0, BATCH_SIZE);
  const uuids = new Set(batch.map((item) => item.client_uuid));
  try {
    await send(batch);
    await commit({ ...remove(uuids), lastError: null, lastSentAt: new Date().toISOString() });
    return 'sent';
  } catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      // A batch Laravel refuses would be refused forever: drop it, keep why.
      await commit({ ...remove(uuids), lastError: `422 ${error.message}` });
      return 'dropped';
    }
    const reason = error instanceof ApiError ? `${error.status} ${error.message}` : 'failed';
    await commit({ ...state, lastError: reason });
    return 'stop';
  }
}

let running: Promise<void> | null = null;

/**
 * Sends everything waiting: points, then events, 500 at a time. Stops at the first failure (no
 * reply, 401 signed out, 429, 5xx); the next point, launch or reconnect tries again.
 */
export function flushDeviceUploads(): Promise<void> {
  running ??= (async () => {
    try {
      await ensureLoaded();
      const server = await serverUrl();
      const token = await getDeviceToken();
      if (!server || !token) return;

      while (state.points.length > 0) {
        const outcome = await sendBatch(
          state.points,
          (batch) => api.postLocations(server, token, batch),
          (sent) => ({ ...state, points: state.points.filter((p) => !sent.has(p.client_uuid)) }),
        );
        if (outcome === 'stop') return;
      }
      while (state.events.length > 0) {
        const outcome = await sendBatch(
          state.events,
          (batch) => api.postActivity(server, token, batch),
          (sent) => ({ ...state, events: state.events.filter((e) => !sent.has(e.client_uuid)) }),
        );
        if (outcome === 'stop') return;
      }
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Sign-out and reset. */
export async function clearDeviceUploads() {
  await ensureLoaded();
  await commit(empty());
}

/** Tests only: as if the app had just started. */
export function resetDeviceUploadsRuntime() {
  state = empty();
  loading = null;
  saving = Promise.resolve();
  running = null;
  listeners.clear();
}
