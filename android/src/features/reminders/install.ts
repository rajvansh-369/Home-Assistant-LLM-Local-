// Wires reminders to the rest of the app (docs/aster-reminders-location-plan.md §4): unlock syncs
// and sends the profile's uploads, the foreground re-checks alarms and sends what waited, home
// mode's arrivals and departures ring and arm arrive-home reminders, and signing out forgets the
// household's reminders. Called once from the root layout.
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import { onSessionOpened } from '@/features/first-run/actions';
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { isAtHome } from '@/features/home-mode/mode';
import { useHomeModeStore } from '@/features/home-mode/store';
import { clearDeviceUploads, flushDeviceUploads } from '@/features/location/uploads';
import { cancelAlarm } from '@/services/notifications';

import { armArriveHome, canUseReminders, handleAlarmResponse, ringArriveHome } from './actions';
import { reconcileAlarms } from './alarms';
import { flushReminderQueue } from './queue';
import { clearReminders, ensureRemindersLoaded, useRemindersStore } from './store';
import { syncReminders } from './sync';

export const SYNC_EVERY_MS = 5 * 60 * 1000;

let lastSync = 0;

function syncSoon(force = false) {
  const { session } = useFirstRunStore.getState();
  if (!isUnlocked(session) || !canUseReminders(session!.profile.role)) return;
  if (!force && Date.now() - lastSync < SYNC_EVERY_MS) return;
  lastSync = Date.now();
  void flushReminderQueue().then(syncReminders);
}

/** Sign-out and reset: this household's reminders and alarms leave the phone. */
export async function forgetReminders() {
  await ensureRemindersLoaded();
  for (const identifier of Object.keys(useRemindersStore.getState().alarms)) {
    await cancelAlarm(identifier);
  }
  await clearReminders();
  await clearDeviceUploads();
}

/** A tap on a reminder notification: `open` shows it when its profile is the one unlocked. */
export type OpenReminder = (clientUuid: string) => void;

let installed = false;
let timer: ReturnType<typeof setInterval> | undefined;

export function installReminders(open: OpenReminder) {
  if (installed) return;
  installed = true;

  onSessionOpened(() => syncSoon(true));

  const onActive = () => {
    void reconcileAlarms();
    void flushDeviceUploads();
    syncSoon();
  };
  onActive();
  AppState.addEventListener('change', (state) => {
    clearInterval(timer);
    if (state !== 'active') return;
    onActive();
    timer = setInterval(syncSoon, SYNC_EVERY_MS);
  });
  timer = setInterval(syncSoon, SYNC_EVERY_MS);

  NetInfo.addEventListener((state) => {
    if (!state.isConnected) return;
    void flushReminderQueue();
    void flushDeviceUploads();
  });

  // Foreground arrivals and departures, in case the geofence is late (or its event came first,
  // which leaves nothing armed).
  useHomeModeStore.subscribe((state, previous) => {
    const wasHome = isAtHome(previous.mode);
    const isHome = isAtHome(state.mode);
    if (!wasHome && isHome) void ringArriveHome();
    if (wasHome && state.mode.kind === 'away') void armArriveHome();
  });

  useFirstRunStore.subscribe((state, previous) => {
    if (previous.hasDeviceToken && !state.hasDeviceToken) void forgetReminders();
  });

  const respond = (response: Notifications.NotificationResponse) =>
    void handleAlarmResponse(response).then((clientUuid) => {
      if (clientUuid) open(clientUuid);
    });
  Notifications.addNotificationResponseReceivedListener(respond);
  // Launched by a tap on a reminder: open it once launch routing is done.
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    void Notifications.clearLastNotificationResponseAsync();
    respond(response);
  });
}
