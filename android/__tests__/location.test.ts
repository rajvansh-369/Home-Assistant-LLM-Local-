// Location (docs/aster-reminders-location-plan.md §5, R4): which fixes become points, the
// geofence's arrived / left points and events, the settings cache, and starting and stopping the
// updates. Against the mock server; expo-location is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { keepPeriodicFixes, recordHomeEvent } from '@/features/location/points';
import {
  refreshLocationSettings,
  resetLocationRuntime,
  saveLocationSettings,
  useLocationStore,
} from '@/features/location/settings';
import { syncTracking } from '@/features/location/tracking';
import { readDeviceUploads, resetDeviceUploadsRuntime } from '@/features/location/uploads';
import { lockSession, loadProfiles, unlockProfile } from '@/features/profiles/actions';
import { api, ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getLastKnownPositionAsync: jest.fn(async () => null),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));

const location = jest.mocked(Location);
const server = 'https://aster.test';
const MIN = 60 * 1000;
const home = {
  id: 41,
  address: 'Maple Court',
  lat: 18.52,
  lng: 73.85,
  radius_m: 150,
  wifi_ssid: null,
  llm_url: 'http://192.168.1.20:8000',
};
const fix = (at: number, latitude = 18.6) => ({
  timestamp: at,
  coords: {
    latitude,
    longitude: 73.9,
    accuracy: 12.345,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
});

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  jest.clearAllMocks();
  resetLocationRuntime();
  resetDeviceUploadsRuntime();
  await resetFirstRun();
  await AsyncStorage.clear();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
  await unlockOwner('123456');
  useFirstRunStore.getState().set({ home });
  finishFirstRun([]);
  // Keep points on the phone, so tests can read them.
  jest.spyOn(api, 'postLocations').mockRejectedValue(new ApiError(0, 'Network request failed'));
  jest.spyOn(api, 'postActivity').mockRejectedValue(new ApiError(0, 'Network request failed'));
});

afterEach(() => jest.restoreAllMocks());

describe('periodic points', () => {
  test('one point per interval, in time order, with Laravel times', async () => {
    const t0 = Date.parse('2026-09-27T10:00:00Z');
    const kept = await keepPeriodicFixes([
      fix(t0 + 20 * MIN),
      fix(t0),
      fix(t0 + 5 * MIN),
      fix(t0 + 14 * MIN),
    ]);
    expect(kept).toBe(2);
    const { points } = await readDeviceUploads();
    expect(points.map((p) => p.recorded_at)).toEqual([
      '2026-09-27T10:00:00Z',
      '2026-09-27T10:14:00Z',
    ]);
    expect(points[0]).toMatchObject({ event: 'periodic', accuracy_m: 12.35, place_id: null });

    // The next batch is spaced from the last kept point.
    expect(await keepPeriodicFixes([fix(t0 + 20 * MIN), fix(t0 + 28 * MIN)])).toBe(1);
  });

  test('nothing while off or paused', async () => {
    useLocationStore.getState().set({
      loaded: true,
      settings: { ...useLocationStore.getState().settings, enabled: false },
    });
    expect(await keepPeriodicFixes([fix(Date.now())])).toBe(0);

    useLocationStore.getState().set({
      settings: {
        ...useLocationStore.getState().settings,
        enabled: true,
        paused_until: new Date(Date.now() + 30 * MIN).toISOString(),
      },
    });
    expect(await keepPeriodicFixes([fix(Date.now())])).toBe(0);
    expect(await keepPeriodicFixes([fix(Date.now() + 31 * MIN)], Date.now() + 31 * MIN)).toBe(1);
  });
});

describe('arriving and leaving', () => {
  test('a fresh fix stands for the arrival; the event goes with it', async () => {
    location.getLastKnownPositionAsync.mockResolvedValueOnce(fix(Date.now(), 18.5201) as never);
    await recordHomeEvent('enter', Date.parse('2026-09-27T19:31:00Z'));
    const { points, events } = await readDeviceUploads();
    expect(points).toEqual([
      expect.objectContaining({
        event: 'arrived',
        lat: 18.5201,
        place_id: 41,
        recorded_at: '2026-09-27T19:31:00Z',
      }),
    ]);
    expect(events).toEqual([
      expect.objectContaining({ type: 'arrived_home', summary: 'Arrived home', profile_id: null }),
    ]);
    expect(location.getLastKnownPositionAsync).toHaveBeenCalledWith({
      maxAge: 5 * MIN,
      requiredAccuracy: 200,
    });
  });

  test('no fresh fix: the home centre with the radius as accuracy', async () => {
    await recordHomeEvent('exit');
    const [left] = (await readDeviceUploads()).points;
    expect(left).toMatchObject({ event: 'left', lat: 18.52, lng: 73.85, accuracy_m: 150 });
    expect((await readDeviceUploads()).events[0].type).toBe('left_home');
  });

  test('nothing while saving is off', async () => {
    useLocationStore.getState().set({
      loaded: true,
      settings: { ...useLocationStore.getState().settings, enabled: false },
    });
    await recordHomeEvent('enter');
    expect(await readDeviceUploads()).toMatchObject({ points: [], events: [] });
  });
});

describe('settings', () => {
  test('the Owner reads them; other profiles keep the cached copy', async () => {
    const owner = useFirstRunStore.getState().session!.profileToken;
    await mockApi.putLocationSettings(server, owner, { interval_minutes: 30, share_area: true });
    expect(await refreshLocationSettings()).toBe(true);
    expect(useLocationStore.getState().settings).toMatchObject({
      interval_minutes: 30,
      share_area: true,
    });

    lockSession();
    const { profiles } = await loadProfiles();
    await unlockProfile(profiles.find((p) => p.role === 'member')!.id, '222222');
    expect(await refreshLocationSettings()).toBe(false);
    expect(useLocationStore.getState().settings.interval_minutes).toBe(30);
  });

  test('a change shows at once and is put back when Laravel refuses', async () => {
    expect(await saveLocationSettings({ share_area: true })).toBe(true);
    expect(useLocationStore.getState().settings.share_area).toBe(true);

    let shown: number | undefined;
    jest.spyOn(api, 'putLocationSettings').mockImplementationOnce(async () => {
      shown = useLocationStore.getState().settings.retention_days;
      throw new ApiError(0, 'Network request failed');
    });
    expect(await saveLocationSettings({ retention_days: 7 })).toBe(false);
    expect(shown).toBe(7);
    expect(useLocationStore.getState().settings.retention_days).toBe(30);
  });
});

describe('starting and stopping', () => {
  test('starts with the interval and the ongoing notification', async () => {
    expect(await syncTracking()).toBe('on');
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      'aster-location-updates',
      expect.objectContaining({
        timeInterval: 15 * MIN,
        distanceInterval: 0,
        foregroundService: expect.objectContaining({
          notificationTitle: 'Aster',
          notificationBody: 'Saving your location every 15 minutes',
        }),
      }),
    );
  });

  test('already running with the same interval: left alone; a new interval restarts', async () => {
    await syncTracking();
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    location.startLocationUpdatesAsync.mockClear();
    await syncTracking();
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled();

    useLocationStore.getState().set({
      settings: { ...useLocationStore.getState().settings, interval_minutes: 30 },
    });
    await syncTracking();
    expect(location.stopLocationUpdatesAsync).toHaveBeenCalled();
    expect(location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      'aster-location-updates',
      expect.objectContaining({ timeInterval: 30 * MIN }),
    );
  });

  test('off without "Allow all the time", before the first run ends, or when turned off', async () => {
    location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    location.getBackgroundPermissionsAsync.mockResolvedValueOnce({ granted: false } as never);
    expect(await syncTracking()).toBe('off');
    expect(location.stopLocationUpdatesAsync).toHaveBeenCalledTimes(1);

    useFirstRunStore.getState().set({ firstRunDone: false });
    expect(await syncTracking()).toBe('off');

    useFirstRunStore.getState().set({ firstRunDone: true });
    useLocationStore.getState().set({
      settings: { ...useLocationStore.getState().settings, enabled: false },
    });
    expect(await syncTracking()).toBe('off');
    expect(location.startLocationUpdatesAsync).not.toHaveBeenCalled();
  });
});
