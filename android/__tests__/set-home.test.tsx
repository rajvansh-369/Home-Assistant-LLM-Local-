import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';

import SetHome from '@/app/(first-run)/set-home';
import { resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { setHome as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { setMockLatency } from '@/services/api/mock';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: jest.fn(),
    dismissTo: jest.fn(),
    canGoBack: () => true,
    back: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  geocodeAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));

const mockNetInfoFetch = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: (...args: unknown[]) => mockNetInfoFetch(...args) },
  NetInfoStateType: { wifi: 'wifi' },
}));

const location = jest.mocked(Location);
const wait = { timeout: 3000 };
const undetermined = { granted: false, canAskAgain: true, status: 'undetermined' };
const denied = { granted: false, canAskAgain: false, status: 'denied' };
const granted = { granted: true, canAskAgain: true, status: 'granted' };
const home = { latitude: 18.5204, longitude: 73.8567 };

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  jest.clearAllMocks();
  location.getForegroundPermissionsAsync.mockResolvedValue(undetermined as never);
  location.requestForegroundPermissionsAsync.mockResolvedValue(denied as never);
  location.getLastKnownPositionAsync.mockResolvedValue(null);
  location.reverseGeocodeAsync.mockResolvedValue([
    { name: 'Maple Court', street: 'Park Road', city: 'Pune' } as never,
  ]);
  mockNetInfoFetch.mockResolvedValue({
    type: 'wifi',
    isConnected: true,
    details: { ssid: '"Test-Wifi"' },
  });
  await resetFirstRun();
  // The mock seeds an Owner "Test Owner" with PIN 123456 for emails starting with "owner".
  await signIn({ server: 'https://aster.test', email: 'owner@example.test', password: 'pw' });
  await unlockOwner('123456');
});

async function searchFor(query: string) {
  await fireEvent.changeText(screen.getByLabelText(copy.searchLabel), query);
  await fireEvent(screen.getByLabelText(copy.searchLabel), 'submitEditing');
}

const saveButton = () => screen.getByRole('button', { name: copy.submit });

test('starts with no point and Save disabled', async () => {
  await render(<SetHome />);
  expect(screen.getByText(copy.noPoint)).toBeTruthy();
  expect(screen.getByText(copy.testHint)).toBeTruthy();
  expect(saveButton()).toBeDisabled();
  // Nothing is asked on arrival.
  expect(location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});

test('search asks for location in context, and says so when it is off', async () => {
  await render(<SetHome />);
  await searchFor('Park Road');
  await waitFor(() => expect(screen.getByText(copy.locationOff)).toBeTruthy(), wait);
  expect(location.geocodeAsync).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByRole('button', { name: copy.locateLabel }));
  await waitFor(() => expect(screen.getByText(copy.locationOff)).toBeTruthy(), wait);
  expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
});

test('search moves the pin, fills the address and the Wi-Fi name; radius updates the line', async () => {
  location.requestForegroundPermissionsAsync.mockResolvedValue(granted as never);
  location.geocodeAsync.mockResolvedValue([home as never]);
  await render(<SetHome />);

  location.geocodeAsync.mockResolvedValueOnce([]);
  await searchFor('Nowhere at all');
  await waitFor(() => expect(screen.getByText(copy.noMatch('Nowhere at all'))).toBeTruthy(), wait);

  await searchFor('Maple Court');
  await waitFor(() => expect(screen.getByText('Maple Court, Park Road, Pune')).toBeTruthy(), wait);
  expect(location.reverseGeocodeAsync).toHaveBeenCalledWith(home);
  expect(screen.getByText(copy.withinRadius(150))).toBeTruthy();
  await waitFor(() => expect(screen.getByDisplayValue('Test-Wifi')).toBeTruthy(), wait);

  await fireEvent.press(screen.getByRole('radio', { name: copy.radiusLabel(300) }));
  expect(screen.getByText(copy.withinRadius(300))).toBeTruthy();
});

test('use my current location', async () => {
  location.requestForegroundPermissionsAsync.mockResolvedValue(granted as never);
  location.getCurrentPositionAsync.mockResolvedValue({ coords: home } as never);
  await render(<SetHome />);
  await fireEvent.press(screen.getByRole('button', { name: copy.locateLabel }));
  await waitFor(() => expect(screen.getByText('Maple Court, Park Road, Pune')).toBeTruthy(), wait);
  expect(location.getCurrentPositionAsync).toHaveBeenCalledWith({
    accuracy: Location.Accuracy.Balanced,
  });
});

test('LLM address: invalid after blur, public warning, then Test shows the reply', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ status: 'ready', error: null, device: 'cuda' }),
  });
  globalThis.fetch = fetchMock;
  await render(<SetHome />);
  const field = screen.getByLabelText(copy.llmLabel);

  await fireEvent.changeText(field, 'not a url');
  await fireEvent(field, 'blur');
  expect(screen.getByText(copy.llmInvalid)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Test' })).toBeDisabled();

  await fireEvent.changeText(field, 'https://llm.example.com');
  expect(screen.getByText(copy.publicLlm)).toBeTruthy();

  await fireEvent.changeText(field, 'http://192.168.1.20:8000');
  expect(screen.queryByText(copy.publicLlm)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Test' }));
  await waitFor(() => expect(screen.getByText(/^Ready · \d+ ms$/)).toBeTruthy(), wait);
  expect(fetchMock).toHaveBeenCalledWith('http://192.168.1.20:8000/health', expect.anything());

  // Editing the address clears the result.
  await fireEvent.changeText(field, 'http://192.168.1.21:8000');
  expect(screen.getByText(copy.testHint)).toBeTruthy();
});

test('Save home sends the place, keeps a copy and moves to 1.5 (no passing test needed)', async () => {
  location.requestForegroundPermissionsAsync.mockResolvedValue(granted as never);
  location.geocodeAsync.mockResolvedValue([home as never]);
  mockNetInfoFetch.mockResolvedValue({ type: 'cellular', isConnected: true, details: null });
  await render(<SetHome />);

  await searchFor('Maple Court');
  await waitFor(() => expect(screen.getByText('Maple Court, Park Road, Pune')).toBeTruthy(), wait);
  expect(saveButton()).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText(copy.llmLabel), 'http://192.168.1.20:8000/');
  expect(saveButton()).toBeEnabled();

  await fireEvent.press(saveButton());
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/permissions'), wait);
  expect(useFirstRunStore.getState().home).toEqual({
    address: 'Maple Court, Park Road, Pune',
    lat: home.latitude,
    lng: home.longitude,
    radius_m: 150,
    wifi_ssid: null,
    llm_url: 'http://192.168.1.20:8000',
  });
});

test('coming back shows the saved home', async () => {
  useFirstRunStore.getState().set({
    home: {
      address: 'Maple Court, Park Road, Pune',
      lat: home.latitude,
      lng: home.longitude,
      radius_m: 500,
      wifi_ssid: 'Test-Wifi',
      llm_url: 'http://192.168.1.20:8000',
    },
  });
  await render(<SetHome />);
  expect(screen.getByText('Maple Court, Park Road, Pune')).toBeTruthy();
  expect(screen.getByText(copy.withinRadius(500))).toBeTruthy();
  expect(screen.getByDisplayValue('Test-Wifi')).toBeTruthy();
  expect(saveButton()).toBeEnabled();
});
