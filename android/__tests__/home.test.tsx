import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Home from '@/app/home';
import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { homePlaceholder as copy, permissions } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { setMockLatency } from '@/services/api/mock';
import * as secure from '@/services/secure';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
    dismissTo: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

jest.mock('@/services/geofence', () => ({ isHomeGeofenceRunning: jest.fn(async () => true) }));
jest.mock('@/tasks/geofence-task', () => ({
  readGeofenceEvents: jest.fn(async () => [{ type: 'enter', at: '2026-09-25T08:00:00.000Z' }]),
}));

const home = {
  address: 'Maple Court, Park Road',
  lat: 18.52,
  lng: 73.85,
  radius_m: 300,
  wifi_ssid: 'Test-Wifi',
  llm_url: 'http://192.168.1.20:8000',
};

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  mockReplace.mockClear();
  await resetFirstRun();
  await signIn({ server: 'https://aster.test', email: 'owner@example.test', password: 'pw' });
  await unlockOwner('123456');
  useFirstRunStore.getState().set({ home });
  finishFirstRun(['sms', 'contacts']);
});

test('lists the saved first-run facts, one screen-reader stop each', async () => {
  await render(<Home />);
  expect(screen.getByRole('header', { name: copy.title })).toBeTruthy();
  expect(screen.getByLabelText(`${copy.facts.server}, https://aster.test`)).toBeTruthy();
  expect(screen.getByLabelText(`${copy.facts.home}, Maple Court, Park Road · 300 m`)).toBeTruthy();
  expect(
    screen.getByLabelText(
      `${copy.facts.skipped}, ${permissions.rows.sms.title}, ${permissions.rows.contacts.title}`,
    ),
  ).toBeTruthy();
  await waitFor(() =>
    expect(screen.getByLabelText(`${copy.facts.geofence}, ${copy.yes}`)).toBeTruthy(),
  );
  expect(screen.getByText(/^Arrived · /)).toBeTruthy();
});

test('never shows a token or the PIN', async () => {
  const deviceToken = await secure.getDeviceToken();
  const { session } = useFirstRunStore.getState();
  await render(<Home />);
  const rendered = JSON.stringify(screen.toJSON());
  for (const secret of [deviceToken, session?.profileToken, session?.llmToken, '123456']) {
    expect(secret).toBeTruthy();
    expect(rendered).not.toContain(secret);
  }
});

test('dev builds can reset first run back to Welcome', async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole('button', { name: copy.reset }));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/welcome'));
  const state = useFirstRunStore.getState();
  expect(state.firstRunDone).toBe(false);
  expect(state.serverUrl).toBeNull();
  expect(await secure.getDeviceToken()).toBeNull();
});
