// One entry per 1.5 Permissions row (plan §4.5, §7 Permissions matrix). check() reads the true
// status; request() runs the row's flow. A blocked runtime permission opens the app's settings.
import * as Location from 'expo-location';
import { Linking, PermissionsAndroid, Platform, type Permission } from 'react-native';

import AsterSystem from '../../../modules/aster-system';

import { clearBlocked, isAnyBlocked, markBlocked } from './blocked';

export type PermissionKey =
  | 'notifications'
  | 'sms'
  | 'location'
  | 'microphone'
  | 'background'
  | 'contacts';

/** `blocked`: refused for good; Allow opens the app's settings page. */
export type PermissionStatus = 'allowed' | 'ask' | 'blocked';

/**
 * `opened`: a screen outside the app is showing (settings or a system dialog), so the result
 * arrives when the app is active again. `done`: the flow finished inside the app.
 */
export type RequestOutcome = 'opened' | 'done';

export type PermissionEntry = {
  key: PermissionKey;
  check: () => Promise<PermissionStatus>;
  request: () => Promise<RequestOutcome>;
};

const P = PermissionsAndroid.PERMISSIONS;
const { GRANTED, NEVER_ASK_AGAIN } = PermissionsAndroid.RESULTS;

/** POST_NOTIFICATIONS exists from Android 13 (API 33); before that notifications are allowed. */
const needsNotificationPrompt = () => Number(Platform.Version) >= 33;

async function openAppSettings(): Promise<RequestOutcome> {
  await Linking.openSettings();
  return 'opened';
}

async function allGranted(permissions: readonly Permission[]): Promise<boolean> {
  const results = await Promise.all(permissions.map((p) => PermissionsAndroid.check(p)));
  return results.every(Boolean);
}

async function checkRuntime(permissions: readonly Permission[]): Promise<PermissionStatus> {
  if (await allGranted(permissions)) {
    await clearBlocked(permissions);
    return 'allowed';
  }
  return (await isAnyBlocked(permissions)) ? 'blocked' : 'ask';
}

/** Runtime prompt for every permission of a row. Resolves true when all are granted. */
async function requestRuntime(permissions: readonly Permission[]): Promise<boolean> {
  const results = await PermissionsAndroid.requestMultiple([...permissions]);
  await markBlocked(permissions.filter((p) => results[p] === NEVER_ASK_AGAIN));
  return permissions.every((p) => results[p] === GRANTED);
}

function runtimeEntry(key: PermissionKey, permissions: readonly Permission[]): PermissionEntry {
  return {
    key,
    check: () => checkRuntime(permissions),
    async request() {
      if ((await checkRuntime(permissions)) === 'blocked') return openAppSettings();
      await requestRuntime(permissions);
      return 'done';
    },
  };
}

/** Notification access: special access, only through its settings page. */
const notifications: PermissionEntry = {
  key: 'notifications',
  check: async () => (AsterSystem.isNotificationListenerEnabled() ? 'allowed' : 'ask'),
  request: async () => (AsterSystem.openNotificationListenerSettings() ? 'opened' : 'done'),
};

/** Location, all the time: foreground first (1.4 may already have it), then background. */
const location: PermissionEntry = {
  key: 'location',
  async check() {
    const backgroundAccess = await Location.getBackgroundPermissionsAsync();
    if (backgroundAccess.granted) return 'allowed';
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) return foreground.canAskAgain ? 'ask' : 'blocked';
    return backgroundAccess.canAskAgain ? 'ask' : 'blocked';
  },
  async request() {
    if ((await location.check()) === 'blocked') return openAppSettings();
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted && !(await Location.requestForegroundPermissionsAsync()).granted) {
      return 'done';
    }
    // Android 11+ shows the settings page where the user picks "Allow all the time".
    await Location.requestBackgroundPermissionsAsync();
    return 'done';
  },
};

/** Run in background: notifications (Android 13+), then battery use "Unrestricted". */
const background: PermissionEntry = {
  key: 'background',
  async check() {
    const notify = needsNotificationPrompt() ? await checkRuntime([P.POST_NOTIFICATIONS]) : 'allowed';
    if (notify !== 'allowed') return notify;
    return AsterSystem.isIgnoringBatteryOptimizations() ? 'allowed' : 'ask';
  },
  async request() {
    if (needsNotificationPrompt()) {
      const notify = await checkRuntime([P.POST_NOTIFICATIONS]);
      if (notify === 'blocked') return openAppSettings();
      if (notify === 'ask' && !(await requestRuntime([P.POST_NOTIFICATIONS]))) return 'done';
    }
    if (AsterSystem.isIgnoringBatteryOptimizations()) return 'done';
    return AsterSystem.requestIgnoreBatteryOptimizations() ? 'opened' : 'done';
  },
};

/** In the §4.5 row order. */
export const permissionEntries: readonly PermissionEntry[] = [
  notifications,
  runtimeEntry('sms', [P.READ_SMS, P.RECEIVE_SMS]),
  location,
  runtimeEntry('microphone', [P.RECORD_AUDIO]),
  background,
  runtimeEntry('contacts', [P.READ_CONTACTS]),
];

export async function checkAll(): Promise<Record<PermissionKey, PermissionStatus>> {
  const statuses = await Promise.all(permissionEntries.map((e) => e.check().catch(() => 'ask' as const)));
  return Object.fromEntries(permissionEntries.map((e, i) => [e.key, statuses[i]])) as Record<
    PermissionKey,
    PermissionStatus
  >;
}
