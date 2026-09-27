// Starting and stopping the location updates (docs/aster-reminders-location-plan.md §5): on with
// the first run done, "Allow all the time" granted and "Save my location" on; off otherwise. A
// changed interval restarts them. Android only starts a location service from the foreground, so
// this runs at launch, when the app comes back, after 1.5 and after 5.3's switch.
import * as Location from 'expo-location';

import { useFirstRunStore } from '@/features/first-run/store';
import { hasTaskManager, LOCATION_TASK } from '@/tasks/location-task';
import { colors } from '@/theme/colors';

import { location as copy } from './copy';
import { changeLocation, ensureLocationLoaded, useLocationStore } from './settings';

export type TrackingState = 'on' | 'off';

async function running(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
}

async function stop() {
  if (await running()) await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
  await changeLocation({ startedInterval: null });
}

async function start(minutes: number) {
  const ms = minutes * 60 * 1000;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: ms,
    deferredUpdatesInterval: ms,
    distanceInterval: 0,
    foregroundService: {
      notificationTitle: copy.service.title,
      notificationBody: copy.service.body(minutes),
      notificationColor: colors.accent,
      killServiceOnDestroy: false,
    },
  });
  await changeLocation({ startedInterval: minutes });
}

let syncing: Promise<TrackingState> | null = null;

/**
 * Brings the updates in line with the settings and permissions. A pause keeps them running (the
 * task drops the points): a service stopped now couldn't restart from the background in an hour.
 */
export function syncTracking(): Promise<TrackingState> {
  syncing ??= (async () => {
    try {
      await ensureLocationLoaded();
      const { settings, startedInterval } = useLocationStore.getState();
      const { firstRunDone } = useFirstRunStore.getState();
      const allowed = (await Location.getBackgroundPermissionsAsync().catch(() => null))?.granted;
      if (!hasTaskManager() || !firstRunDone || !allowed || !settings.enabled) {
        await stop();
        return 'off';
      }
      const on = await running();
      if (on && startedInterval === settings.interval_minutes) return 'on';
      if (on) await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {});
      await start(settings.interval_minutes);
      return 'on';
    } catch {
      // Location services off, or started from the background: try again at the next foreground.
      return 'off';
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** Sign-out and reset. */
export async function stopTracking() {
  await stop();
}
