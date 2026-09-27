// Home geofence task (plan §7 Geofence). Defined at module scope and imported from the root
// layout, so it exists when Android wakes the app for an event. It records enter and exit with a
// timestamp, and tells home mode (src/features/home-mode) when the app is running. On a real
// arrival or departure it also saves an arrived / left point with its activity event (reminders
// plan §5), and arriving rings the armed arrive-home reminders while leaving arms them (§4).
// expo-location registers with an initial trigger, so every registration reports where the phone
// is; that, or a repeat of the last event, isn't a transition and only updates home mode.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeofencingEventType, type LocationRegion } from 'expo-location';

import { recordHomeEvent } from '@/features/location/points';
import { armArriveHome, ringArriveHome } from '@/features/reminders/actions';

// Expo Go on Android has no TaskManager, and importing it there throws. Load it defensively so
// the app still opens (without the geofence) instead of crashing at start.
let TaskManager: typeof import('expo-task-manager') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module
  TaskManager = require('expo-task-manager');
} catch {
  if (__DEV__) console.warn('TaskManager unavailable (Expo Go?): the home geofence is off.');
}

export const HOME_GEOFENCE_TASK = 'aster-home-geofence';
export const GEOFENCE_EVENTS_KEY = 'aster.geofence-events';
/** Oldest events are dropped beyond this. */
const MAX_EVENTS = 50;

export type GeofenceEvent = { type: 'enter' | 'exit'; at: string };

export async function readGeofenceEvents(): Promise<GeofenceEvent[]> {
  const raw = await AsyncStorage.getItem(GEOFENCE_EVENTS_KEY);
  return raw ? (JSON.parse(raw) as GeofenceEvent[]) : [];
}

const listeners = new Set<(event: GeofenceEvent) => void>();

/** Called after each recorded event while the app's JS is running. Returns an unsubscribe. */
export function onGeofenceEvent(listener: (event: GeofenceEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function recordGeofenceEvent(event: GeofenceEvent): Promise<void> {
  const events = [...(await readGeofenceEvents()), event].slice(-MAX_EVENTS);
  await AsyncStorage.setItem(GEOFENCE_EVENTS_KEY, JSON.stringify(events));
  listeners.forEach((listener) => listener(event));
}

/**
 * One geofence event. Returns true when it was a transition (the last recorded event was the
 * other one) and the arrival or departure was acted on.
 */
export async function onHomeGeofence(type: GeofenceEvent['type'], now = new Date()) {
  const previous = (await readGeofenceEvents()).at(-1)?.type ?? null;
  await recordGeofenceEvent({ type, at: now.toISOString() });
  if (previous === null || previous === type) return false;
  await recordHomeEvent(type, now.getTime()).catch(() => {});
  await (type === 'enter' ? ringArriveHome(now) : armArriveHome()).catch(() => {});
  return true;
}

type GeofenceData = { eventType: GeofencingEventType; region: LocationRegion };

TaskManager?.defineTask<GeofenceData>(HOME_GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  await onHomeGeofence(data.eventType === GeofencingEventType.Enter ? 'enter' : 'exit');
});
