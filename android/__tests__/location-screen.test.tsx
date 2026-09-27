// 5.3 Location, the 5.1 Home and location rows, and "Use my area in answers"
// (docs/aster-reminders-location-plan.md §3, §5, R5).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';

import Settings from '@/app/(tabs)/settings';
import { buildMessages } from '@/features/chat/prompt';
import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { areaLine, refreshArea, resetAreaRuntime } from '@/features/location/area';
import { location as copy } from '@/features/location/copy';
import { dayKey } from '@/features/location/day';
import { LocationScreen } from '@/features/location/LocationScreen';
import { resetLocationRuntime, useLocationStore } from '@/features/location/settings';
import { resetDeviceUploadsRuntime } from '@/features/location/uploads';
import { loadProfiles, lockSession, unlockProfile } from '@/features/profiles/actions';
import { getDeviceToken } from '@/services/secure';
import { mockApi, setMockLatency } from '@/services/api/mock';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    canGoBack: () => true,
    navigate: jest.fn(),
    replace: jest.fn(),
  },
  Redirect: () => null,
  useFocusEffect: jest.fn(),
}));
jest.mock('@/services/geofence', () => ({ isHomeGeofenceRunning: jest.fn(async () => true) }));
jest.mock('expo-location', () => ({
  getLastKnownPositionAsync: jest.fn(async () => ({
    timestamp: Date.now(),
    coords: { latitude: 18.52, longitude: 73.85, accuracy: 10 },
  })),
  reverseGeocodeAsync: jest.fn(async () => [{ city: 'Pune' }]),
}));

const location = jest.mocked(Location);
const server = 'https://aster.test';
const HOUR = 60 * 60 * 1000;
const home = {
  id: 41,
  address: 'Maple Court',
  lat: 18.52,
  lng: 73.85,
  radius_m: 150,
  wifi_ssid: null,
  llm_url: 'http://192.168.1.20:8000',
};

/** Local time today at h:m, as Laravel stores it. */
const today = (h: number, m = 0) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString();
};

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  jest.clearAllMocks();
  resetLocationRuntime();
  resetDeviceUploadsRuntime();
  resetAreaRuntime();
  await resetFirstRun();
  await AsyncStorage.clear();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
  await unlockOwner('123456');
  useFirstRunStore.getState().set({ home });
  finishFirstRun([]);
});

describe('5.3 Location', () => {
  async function seedDay() {
    const device = (await getDeviceToken())!;
    const point = (uuid: string, event: 'periodic' | 'arrived' | 'left', at: string) => ({
      client_uuid: uuid,
      lat: 18.53,
      lng: 73.86,
      event,
      recorded_at: at,
    });
    await mockApi.postLocations(server, device, [
      point('11111111-1111-4111-8111-111111111111', 'left', today(0, 30)),
      point('22222222-2222-4222-8222-222222222222', 'periodic', today(0, 45)),
      point('33333333-3333-4333-8333-333333333333', 'arrived', today(1, 0)),
    ]);
  }

  test("today's arrivals and departures, in order", async () => {
    await seedDay();
    await render(<LocationScreen />);
    expect(await screen.findByText(copy.screen.left)).toBeTruthy();
    expect(screen.getByText(copy.screen.leftDetail)).toBeTruthy();
    expect(screen.getByText(copy.screen.arrived)).toBeTruthy();
    expect(screen.getByRole('header', { name: copy.screen.day(new Date(), 0) })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: copy.screen.nextDay }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  test('a day without events says so and counts the points; earlier days load', async () => {
    const get = jest.spyOn(mockApi, 'getLocations');
    await render(<LocationScreen />);
    expect(await screen.findByText(copy.screen.noEvents)).toBeTruthy();
    expect(screen.getByText(copy.screen.points(0))).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: copy.screen.previousDay }));
    const yesterday = new Date(Date.now() - 24 * HOUR);
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        server,
        expect.any(String),
        dayKey(yesterday),
        expect.any(String),
      ),
    );
    get.mockRestore();
  });

  test('the switches, Keep history and Pause save to Laravel', async () => {
    await render(<LocationScreen />);
    const owner = useFirstRunStore.getState().session!.profileToken;

    await fireEvent.press(screen.getByRole('switch', { name: copy.screen.area }));
    await waitFor(async () =>
      expect((await mockApi.getLocationSettings(server, owner)).share_area).toBe(true),
    );

    await fireEvent.press(screen.getByRole('button', { name: copy.screen.keep }));
    await fireEvent.press(screen.getByRole('radio', { name: '7' }));
    await waitFor(async () =>
      expect((await mockApi.getLocationSettings(server, owner)).retention_days).toBe(7),
    );
    expect(screen.getByText(copy.screen.ownerOnly(7))).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: copy.screen.pause }));
    await waitFor(async () =>
      expect((await mockApi.getLocationSettings(server, owner)).paused_until).not.toBeNull(),
    );
    expect(await screen.findByText(/^Paused until /)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: copy.screen.resume }));
    await waitFor(async () =>
      expect((await mockApi.getLocationSettings(server, owner)).paused_until).toBeNull(),
    );

    await fireEvent.press(screen.getByRole('switch', { name: copy.screen.save }));
    await waitFor(() => expect(useLocationStore.getState().settings.enabled).toBe(false));
  });
});

describe('5.1 Home and location', () => {
  test('the Owner sees Home and Location history, which opens 5.3', async () => {
    await render(<Settings />);
    expect(screen.getByRole('header', { name: copy.settingsRows.section })).toBeTruthy();
    // The row, and the dev facts' Home line (dev builds only) which reads the same.
    expect(
      screen.getAllByLabelText(
        `${copy.settingsRows.home}, ${copy.settingsRows.homeDetail('Maple Court', 150)}`,
      ),
    ).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: copy.settingsRows.history }));
    expect(mockPush).toHaveBeenCalledWith('/location');
    expect(screen.getByText(copy.settingsRows.historyDetail(15, 30))).toBeTruthy();
  });

  test('a Member does not', async () => {
    lockSession();
    const { profiles } = await loadProfiles();
    await unlockProfile(profiles.find((p) => p.role === 'member')!.id, '222222');
    await render(<Settings />);
    expect(screen.queryByText(copy.settingsRows.section)).toBeNull();
  });
});

describe('Use my area in answers', () => {
  const share = (share_area: boolean, enabled = true) =>
    useLocationStore.getState().set({
      loaded: true,
      settings: { ...useLocationStore.getState().settings, share_area, enabled },
    });

  test('the city only, while sharing and saving are on', async () => {
    share(false);
    await refreshArea();
    expect(location.reverseGeocodeAsync).not.toHaveBeenCalled();
    expect(areaLine()).toBeNull();

    share(true);
    await refreshArea();
    expect(areaLine()).toBe('The user is in or near Pune.');

    share(true, false);
    expect(areaLine()).toBeNull();
  });

  test('looked up at most every 30 minutes; too old is not used', async () => {
    share(true);
    const t0 = Date.now();
    await refreshArea(t0);
    await refreshArea(t0 + 10 * 60 * 1000);
    expect(location.reverseGeocodeAsync).toHaveBeenCalledTimes(1);
    expect(areaLine(t0 + 13 * HOUR)).toBeNull();
  });

  test('the prompt carries it in the one system message, never coordinates', () => {
    const [system] = buildMessages({
      personality: 'Short answers.',
      area: 'The user is in or near Pune.',
      history: [],
      question: 'Good cafes near me?',
    });
    expect(system).toEqual({
      role: 'system',
      content: 'Short answers.\n\nThe user is in or near Pune.',
    });
    expect(buildMessages({ area: null, history: [], question: 'Hi' })).toEqual([
      { role: 'user', content: 'Hi' },
    ]);
  });
});
