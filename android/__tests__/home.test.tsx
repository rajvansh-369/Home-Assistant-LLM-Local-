import { fireEvent, render, screen } from '@testing-library/react-native';

import Home from '@/app/(tabs)/home';
import Settings from '@/app/(tabs)/settings';
import { homePlaceholder as facts, permissions } from '@/features/first-run/copy';
import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { home as copy, homeStatus } from '@/features/home/copy';
import { useHomeModeStore } from '@/features/home-mode/store';
import { setMockLatency } from '@/services/api/mock';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    navigate: jest.fn(),
    replace: jest.fn(),
    dismissTo: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

jest.mock('@/services/geofence', () => ({ isHomeGeofenceRunning: jest.fn(async () => true) }));
jest.mock('@/tasks/geofence-task', () => ({
  readGeofenceEvents: jest.fn(async () => [{ type: 'enter', at: '2026-09-25T08:00:00.000Z' }]),
  onGeofenceEvent: jest.fn(() => () => {}),
}));

const home = {
  address: 'Maple Court, Park Road',
  lat: 18.52,
  lng: 73.85,
  radius_m: 300,
  wifi_ssid: 'Test-Wifi',
  llm_url: 'http://192.168.1.20:8000',
};

const setMode = (mode: ReturnType<typeof useHomeModeStore.getState>['mode']) =>
  useHomeModeStore.setState({ mode });

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  mockPush.mockClear();
  await resetFirstRun();
  await signIn({ server: 'https://aster.test', email: 'owner@example.test', password: 'pw' });
  await unlockOwner('123456');
  useFirstRunStore.getState().set({ home });
  finishFirstRun(['sms', 'contacts']);
});

test('3.1 at home: greeting, the ready chip, suggestions and Ask Aster anything', async () => {
  setMode({ kind: 'ready', busy: false });
  await render(<Home />);

  expect(
    screen.getByRole('header', { name: /^Good (morning|afternoon|evening), Test Owner$/ }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: homeStatus.readyShort('zephyr-7b') })).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: copy.suggestions[0] }));
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/chat/[id]',
    params: { id: 'new', q: copy.suggestions[0] },
  });

  await fireEvent.press(screen.getByRole('button', { name: copy.askAnything }));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/chat/[id]', params: { id: 'new' } });
});

test('3.1 while the model loads: the banner, and suggestions wait', async () => {
  setMode({ kind: 'loading' });
  await render(<Home />);

  expect(screen.getByText(copy.loadingBanner)).toBeTruthy();
  expect(
    screen.getByRole('button', { name: copy.suggestions[0] }).props.accessibilityState,
  ).toMatchObject({ disabled: true });
});

test('3.2 away: the distance and a disabled composer', async () => {
  setMode({ kind: 'away', distanceM: 6240, me: null });
  await render(<Home />);

  expect(screen.getByRole('header', { name: copy.away.distance('6.2') })).toBeTruthy();
  expect(screen.getByLabelText(copy.away.chatAtHome)).toBeTruthy();
  expect(screen.queryByRole('button', { name: copy.askAnything })).toBeNull();
});

test('the avatar locks the profile', async () => {
  setMode({ kind: 'ready', busy: false });
  await render(<Home />);
  await fireEvent.press(screen.getByRole('button', { name: copy.switchOrLock }));
  expect(useFirstRunStore.getState().session).toBeNull();
});

test('dev builds list the saved facts at the bottom of Settings', async () => {
  await render(<Settings />);
  expect(screen.getByLabelText(`${facts.facts.server}, https://aster.test`)).toBeTruthy();
  expect(
    screen.getByLabelText(
      `${facts.facts.skipped}, ${permissions.rows.sms.title}, ${permissions.rows.contacts.title}`,
    ),
  ).toBeTruthy();
  expect(await screen.findByLabelText(`${facts.facts.geofence}, ${facts.yes}`)).toBeTruthy();
});
