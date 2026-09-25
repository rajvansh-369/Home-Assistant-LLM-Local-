import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Linking, PermissionsAndroid, Platform } from 'react-native';

import AsterSystem from '../modules/aster-system';
import { syncHomeGeofence } from '@/services/geofence';
import { checkAll, permissionEntries, type PermissionKey } from '@/services/permissions';
import { BLOCKED_PERMISSIONS_KEY } from '@/services/permissions/blocked';
import { HOME_GEOFENCE_TASK, readGeofenceEvents } from '@/tasks/geofence-task';

jest.mock('expo-location', () => ({
  GeofencingEventType: { Enter: 1, Exit: 2 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  startGeofencingAsync: jest.fn(),
  hasStartedGeofencingAsync: jest.fn(),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));

const location = jest.mocked(Location);
const system = jest.mocked(AsterSystem);
const P = PermissionsAndroid.PERMISSIONS;
const { GRANTED, DENIED, NEVER_ASK_AGAIN } = PermissionsAndroid.RESULTS;

const access = (granted: boolean, canAskAgain = true) =>
  ({ granted, canAskAgain, status: granted ? 'granted' : 'denied' }) as never;

let granted: Set<string>;
const check = jest.spyOn(PermissionsAndroid, 'check');
const requestMultiple = jest.spyOn(PermissionsAndroid, 'requestMultiple');
const openSettings = jest.spyOn(Linking, 'openSettings');
const androidVersion = jest.spyOn(Platform, 'Version', 'get');

const entry = (key: PermissionKey) => permissionEntries.find((e) => e.key === key)!;

// Defined once at import (module scope), before beforeEach clears the mock's calls.
const geofenceExecutor = jest
  .mocked(TaskManager.defineTask)
  .mock.calls.find(([name]) => name === HOME_GEOFENCE_TASK)?.[1];

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  granted = new Set();
  check.mockImplementation(async (p) => granted.has(p));
  requestMultiple.mockResolvedValue({} as never);
  openSettings.mockResolvedValue(undefined);
  androidVersion.mockReturnValue(34);
  location.getForegroundPermissionsAsync.mockResolvedValue(access(false));
  location.getBackgroundPermissionsAsync.mockResolvedValue(access(false));
  location.requestForegroundPermissionsAsync.mockResolvedValue(access(true));
  location.requestBackgroundPermissionsAsync.mockResolvedValue(access(true));
  system.isNotificationListenerEnabled.mockReturnValue(false);
  system.openNotificationListenerSettings.mockReturnValue(true);
  system.isIgnoringBatteryOptimizations.mockReturnValue(false);
  system.requestIgnoreBatteryOptimizations.mockReturnValue(true);
});

test('rows come in the §4.5 order', () => {
  expect(permissionEntries.map((e) => e.key)).toEqual([
    'notifications',
    'sms',
    'location',
    'microphone',
    'background',
    'contacts',
  ]);
});

describe('runtime rows: SMS, microphone, contacts', () => {
  test('SMS is allowed only with both READ_SMS and RECEIVE_SMS', async () => {
    granted.add(P.READ_SMS);
    expect(await entry('sms').check()).toBe('ask');
    granted.add(P.RECEIVE_SMS);
    expect(await entry('sms').check()).toBe('allowed');
  });

  test('Allow prompts for the row permissions', async () => {
    requestMultiple.mockResolvedValue({ [P.READ_SMS]: GRANTED, [P.RECEIVE_SMS]: GRANTED } as never);
    expect(await entry('sms').request()).toBe('done');
    expect(requestMultiple).toHaveBeenCalledWith([P.READ_SMS, P.RECEIVE_SMS]);
    expect(await entry('microphone').request()).toBe('done');
    expect(requestMultiple).toHaveBeenLastCalledWith([P.RECORD_AUDIO]);
    expect(await entry('contacts').request()).toBe('done');
    expect(requestMultiple).toHaveBeenLastCalledWith([P.READ_CONTACTS]);
    expect(openSettings).not.toHaveBeenCalled();
  });

  test('"Don\'t ask again" is remembered; then Allow opens the app settings', async () => {
    requestMultiple.mockResolvedValue({ [P.RECORD_AUDIO]: NEVER_ASK_AGAIN } as never);
    await entry('microphone').request();
    expect(await entry('microphone').check()).toBe('blocked');

    requestMultiple.mockClear();
    expect(await entry('microphone').request()).toBe('opened');
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(requestMultiple).not.toHaveBeenCalled();

    // Granted from the settings page: the refusal is forgotten.
    granted.add(P.RECORD_AUDIO);
    expect(await entry('microphone').check()).toBe('allowed');
    expect(JSON.parse((await AsyncStorage.getItem(BLOCKED_PERMISSIONS_KEY))!)).toEqual([]);
  });

  test('a plain denial can be asked again', async () => {
    requestMultiple.mockResolvedValue({ [P.READ_CONTACTS]: DENIED } as never);
    await entry('contacts').request();
    expect(await entry('contacts').check()).toBe('ask');
  });
});

describe('Location, all the time', () => {
  test('allowed only with background location', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue(access(true));
    expect(await entry('location').check()).toBe('ask');
    location.getBackgroundPermissionsAsync.mockResolvedValue(access(true));
    expect(await entry('location').check()).toBe('allowed');
  });

  test('asks for foreground first, then background', async () => {
    await entry('location').request();
    expect(location.requestForegroundPermissionsAsync).toHaveBeenCalled();
    expect(location.requestBackgroundPermissionsAsync).toHaveBeenCalled();
    const order = [
      location.requestForegroundPermissionsAsync.mock.invocationCallOrder[0],
      location.requestBackgroundPermissionsAsync.mock.invocationCallOrder[0],
    ];
    expect(order[0]).toBeLessThan(order[1]);
  });

  test('skips the foreground prompt when 1.4 already got it', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue(access(true));
    await entry('location').request();
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(location.requestBackgroundPermissionsAsync).toHaveBeenCalled();
  });

  test('stops when foreground is refused', async () => {
    location.requestForegroundPermissionsAsync.mockResolvedValue(access(false));
    await entry('location').request();
    expect(location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  });

  test('blocked foreground or background opens the app settings', async () => {
    location.getForegroundPermissionsAsync.mockResolvedValue(access(false, false));
    expect(await entry('location').check()).toBe('blocked');
    expect(await entry('location').request()).toBe('opened');
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();

    location.getForegroundPermissionsAsync.mockResolvedValue(access(true));
    location.getBackgroundPermissionsAsync.mockResolvedValue(access(false, false));
    expect(await entry('location').check()).toBe('blocked');
  });
});

describe('Notification access', () => {
  test('allowed when Aster is an enabled listener; Allow opens its settings page', async () => {
    expect(await entry('notifications').check()).toBe('ask');
    expect(await entry('notifications').request()).toBe('opened');
    expect(system.openNotificationListenerSettings).toHaveBeenCalled();
    system.isNotificationListenerEnabled.mockReturnValue(true);
    expect(await entry('notifications').check()).toBe('allowed');
  });
});

describe('Run in background', () => {
  test('Android 13+: notifications granted and battery unrestricted', async () => {
    system.isIgnoringBatteryOptimizations.mockReturnValue(true);
    expect(await entry('background').check()).toBe('ask');
    granted.add(P.POST_NOTIFICATIONS);
    expect(await entry('background').check()).toBe('allowed');
  });

  test('Allow prompts for notifications, then shows the battery dialog', async () => {
    requestMultiple.mockResolvedValue({ [P.POST_NOTIFICATIONS]: GRANTED } as never);
    expect(await entry('background').request()).toBe('opened');
    expect(requestMultiple).toHaveBeenCalledWith([P.POST_NOTIFICATIONS]);
    expect(system.requestIgnoreBatteryOptimizations).toHaveBeenCalled();
  });

  test('refused notifications stop before the battery dialog', async () => {
    requestMultiple.mockResolvedValue({ [P.POST_NOTIFICATIONS]: DENIED } as never);
    expect(await entry('background').request()).toBe('done');
    expect(system.requestIgnoreBatteryOptimizations).not.toHaveBeenCalled();
  });

  test('blocked notifications open the app settings', async () => {
    requestMultiple.mockResolvedValue({ [P.POST_NOTIFICATIONS]: NEVER_ASK_AGAIN } as never);
    await entry('background').request();
    expect(await entry('background').check()).toBe('blocked');
    expect(await entry('background').request()).toBe('opened');
    expect(openSettings).toHaveBeenCalled();
  });

  test('below Android 13 only the battery counts', async () => {
    androidVersion.mockReturnValue(32);
    system.isIgnoringBatteryOptimizations.mockReturnValue(true);
    expect(await entry('background').check()).toBe('allowed');
    expect(check).not.toHaveBeenCalledWith(P.POST_NOTIFICATIONS);
  });
});

test('checkAll reads every row; a failing check counts as not allowed', async () => {
  system.isNotificationListenerEnabled.mockImplementation(() => {
    throw new Error('context lost');
  });
  granted.add(P.READ_CONTACTS);
  expect(await checkAll()).toEqual({
    notifications: 'ask',
    sms: 'ask',
    location: 'ask',
    microphone: 'ask',
    background: 'ask',
    contacts: 'allowed',
  });
});

describe('home geofence', () => {
  const home = { lat: 18.52, lng: 73.85, radius_m: 300 };

  test('registers "home" once background location is granted and a home exists', async () => {
    expect(await syncHomeGeofence(home)).toBe(false);
    expect(await syncHomeGeofence(null)).toBe(false);
    expect(location.startGeofencingAsync).not.toHaveBeenCalled();

    location.getBackgroundPermissionsAsync.mockResolvedValue(access(true));
    expect(await syncHomeGeofence(home)).toBe(true);
    expect(location.startGeofencingAsync).toHaveBeenCalledWith(HOME_GEOFENCE_TASK, [
      {
        identifier: 'home',
        latitude: 18.52,
        longitude: 73.85,
        radius: 300,
        notifyOnEnter: true,
        notifyOnExit: true,
      },
    ]);
  });

  test('the task records enter and exit with a timestamp', async () => {
    const executor = geofenceExecutor;
    expect(executor).toBeDefined();
    const region = { latitude: 0, longitude: 0, radius: 1 };
    await executor!({ data: { eventType: 1, region }, error: null, executionInfo: {} as never });
    await executor!({ data: { eventType: 2, region }, error: null, executionInfo: {} as never });
    const events = await readGeofenceEvents();
    expect(events.map((e) => e.type)).toEqual(['enter', 'exit']);
    expect(Number.isNaN(Date.parse(events[0].at))).toBe(false);
  });
});
