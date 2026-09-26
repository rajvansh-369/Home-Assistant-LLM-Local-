// Home geofence task (plan §7 Geofence). Defined at module scope and imported from the root
// layout, so it exists when Android wakes the app for an event. For now it only records enter and
// exit with a timestamp; the Wi-Fi check, /health and home mode come with row 3.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeofencingEventType, type LocationRegion } from 'expo-location';

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

export async function recordGeofenceEvent(event: GeofenceEvent): Promise<void> {
  const events = [...(await readGeofenceEvents()), event].slice(-MAX_EVENTS);
  await AsyncStorage.setItem(GEOFENCE_EVENTS_KEY, JSON.stringify(events));
}

type GeofenceData = { eventType: GeofencingEventType; region: LocationRegion };

TaskManager?.defineTask<GeofenceData>(HOME_GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const type = data.eventType === GeofencingEventType.Enter ? 'enter' : 'exit';
  await recordGeofenceEvent({ type, at: new Date().toISOString() });
});
