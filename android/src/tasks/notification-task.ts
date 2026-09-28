// Reminder buttons while the app is in the background or closed (docs/aster-reminders-location-
// plan.md §6). On Android, expo-notifications runs this task for a tapped action button (Done,
// Snooze 30 min; and the home notices' Later and Retry, docs/aster-messages-alerts-plan.md §3 4.4);
// taps on the notification itself open the app and reach the response listener.
// Defined at module scope and imported from the root layout, like the geofence task.
import * as Notifications from 'expo-notifications';

import { handleNoticeResponse } from '@/features/messages/notify';
import { handleAlarmResponse, type AlarmResponse } from '@/features/reminders/actions';

// Expo Go on Android has no TaskManager; see geofence-task.ts.
let TaskManager: typeof import('expo-task-manager') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module
  TaskManager = require('expo-task-manager');
} catch {
  if (__DEV__) console.warn('TaskManager unavailable (Expo Go?): reminder buttons need the app.');
}

export const NOTIFICATION_TASK = 'aster-notification-actions';

const isResponse = (data: unknown): data is AlarmResponse =>
  typeof data === 'object' && data != null && 'actionIdentifier' in data && 'notification' in data;

TaskManager?.defineTask<unknown>(NOTIFICATION_TASK, async ({ data, error }) => {
  if (error || !isResponse(data)) return;
  await handleAlarmResponse(data);
  await handleNoticeResponse(data).catch(() => null);
});

/** Tells expo-notifications to run the task. Safe to repeat; never throws. */
export async function registerNotificationTask() {
  if (!TaskManager) return;
  await Notifications.registerTaskAsync(NOTIFICATION_TASK).catch(() => {});
}
