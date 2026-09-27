// The home-mode controller against faked signals: Wi-Fi, position, geofence and /health.
import { checkHomeMode, resetHomeModeController } from '@/features/home-mode/controller';
import { useHomeModeStore } from '@/features/home-mode/store';
import { useFirstRunStore } from '@/features/first-run/store';
import type { LlmHealth } from '@/services/api';
import { checkLlmHealth } from '@/services/llm/health';
import { lastKnownPosition } from '@/services/location';
import { currentWifiName } from '@/services/wifi';

jest.mock('@/services/wifi', () => ({ currentWifiName: jest.fn() }));
jest.mock('@/services/location', () => ({ lastKnownPosition: jest.fn() }));
jest.mock('@/services/llm/health', () => ({ checkLlmHealth: jest.fn() }));
jest.mock('@/tasks/geofence-task', () => ({
  readGeofenceEvents: jest.fn(async () => []),
  onGeofenceEvent: jest.fn(() => () => {}),
}));

const wifi = jest.mocked(currentWifiName);
const position = jest.mocked(lastKnownPosition);
const health = jest.mocked(checkLlmHealth);

const home = {
  address: '1 Test Street',
  lat: 12.97,
  lng: 77.6,
  radius_m: 150,
  wifi_ssid: 'HomeNet',
  llm_url: 'http://192.168.1.20:8000',
};
const mode = () => useHomeModeStore.getState().mode;
const ready: LlmHealth = { kind: 'ready', model: 'zephyr-7b', ms: 20 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  resetHomeModeController();
  useHomeModeStore.setState({ mode: { kind: 'away', distanceM: null }, checkedAt: null });
  useFirstRunStore.getState().set({ home, llmEngine: 'local' });
  wifi.mockResolvedValue(null);
  position.mockResolvedValue(null);
  health.mockResolvedValue(ready);
});

afterEach(() => {
  resetHomeModeController();
  jest.useRealTimers();
});

test('no home saved: noHome, nothing checked', async () => {
  useFirstRunStore.getState().set({ home: null });
  await checkHomeMode();
  expect(mode()).toEqual({ kind: 'noHome' });
  expect(health).not.toHaveBeenCalled();
});

test('away with a position: the distance, and /health is not called', async () => {
  position.mockResolvedValue({ latitude: 13.02, longitude: 77.6 });
  await checkHomeMode();
  expect(mode()).toMatchObject({ kind: 'away' });
  expect((mode() as { distanceM: number }).distanceM).toBeGreaterThan(5000);
  expect(health).not.toHaveBeenCalled();
});

test('home Wi-Fi and a ready model: Ready', async () => {
  wifi.mockResolvedValue('HomeNet');
  await checkHomeMode();
  expect(health).toHaveBeenCalledWith(home.llm_url);
  expect(mode()).toEqual({ kind: 'ready', busy: false });
});

test('inside the area with no Wi-Fi name saved counts too', async () => {
  useFirstRunStore.getState().set({ home: { ...home, wifi_ssid: null } });
  position.mockResolvedValue({ latitude: home.lat, longitude: home.lng });
  await checkHomeMode();
  expect(mode().kind).toBe('ready');
});

test('loading polls every 10 s until ready', async () => {
  wifi.mockResolvedValue('HomeNet');
  health.mockResolvedValueOnce({ kind: 'loading', ms: 5 });
  await checkHomeMode();
  expect(mode()).toEqual({ kind: 'loading' });

  await jest.advanceTimersByTimeAsync(10_000);
  expect(health).toHaveBeenCalledTimes(2);
  expect(mode().kind).toBe('ready');
});

test('no reply retries after a minute', async () => {
  wifi.mockResolvedValue('HomeNet');
  health.mockResolvedValueOnce({ kind: 'no-reply' });
  await checkHomeMode();
  expect(mode()).toEqual({ kind: 'noServer' });

  await jest.advanceTimersByTimeAsync(59_000);
  expect(health).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1_000);
  expect(mode().kind).toBe('ready');
});

test('losing home Wi-Fi keeps home mode for 2 minutes, then Away', async () => {
  wifi.mockResolvedValue('HomeNet');
  await checkHomeMode();
  expect(mode().kind).toBe('ready');

  wifi.mockResolvedValue(null);
  await checkHomeMode();
  expect(mode().kind).toBe('ready');

  await jest.advanceTimersByTimeAsync(2 * 60_000);
  expect(mode().kind).toBe('away');
});

test('the profile on Mark-L is ready while Zephyr still loads', async () => {
  useFirstRunStore.getState().set({ llmEngine: 'markl' });
  wifi.mockResolvedValue('HomeNet');
  health.mockResolvedValue({
    kind: 'loading',
    ms: 5,
    server: { engines: { local: 'loading', markl: 'ready' }, engine: 'local', busy: false },
  });
  await checkHomeMode();
  expect(mode().kind).toBe('ready');
});
