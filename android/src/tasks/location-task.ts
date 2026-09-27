// Periodic location updates (docs/aster-reminders-location-plan.md §5, §6): the foreground
// service delivers fixes here, also while the app is closed. Defined at module scope and imported
// from the root layout, like the geofence task.
import type { LocationObject } from 'expo-location';

import { keepPeriodicFixes } from '@/features/location/points';

// Expo Go on Android has no TaskManager; see geofence-task.ts.
let TaskManager: typeof import('expo-task-manager') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module
  TaskManager = require('expo-task-manager');
} catch {
  if (__DEV__) console.warn('TaskManager unavailable (Expo Go?): location saving is off.');
}

export const LOCATION_TASK = 'aster-location-updates';

export const hasTaskManager = () => TaskManager != null;

TaskManager?.defineTask<{ locations: LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  await keepPeriodicFixes(data.locations).catch(() => 0);
});
