import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import Permissions from '@/app/(first-run)/permissions';
import { resetFirstRun } from '@/features/first-run/actions';
import { common, permissions as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { syncHomeGeofence } from '@/services/geofence';
import type { PermissionKey, PermissionStatus, RequestOutcome } from '@/services/permissions';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: (...args: unknown[]) => mockReplace(...args),
    dismissTo: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

// The six rows with statuses and request outcomes the tests control.
const keys: PermissionKey[] = ['notifications', 'sms', 'location', 'microphone', 'background', 'contacts'];
const mockStatus: Record<string, PermissionStatus> = {};
const mockRequest = jest.fn<Promise<RequestOutcome>, [PermissionKey]>();

jest.mock('@/services/permissions', () => {
  const rows = ['notifications', 'sms', 'location', 'microphone', 'background', 'contacts'];
  return {
    permissionEntries: rows.map((key) => ({
      key,
      check: async () => mockStatus[key],
      request: () => mockRequest(key as PermissionKey),
    })),
    checkAll: async () => ({ ...mockStatus }),
  };
});

jest.mock('@/services/geofence', () => ({ syncHomeGeofence: jest.fn(async () => true) }));

let appStateListener: (state: AppStateStatus) => void = () => {};
jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
  appStateListener = listener as (state: AppStateStatus) => void;
  return { remove: jest.fn() } as never;
});

const allowButton = (key: PermissionKey) =>
  screen.getByRole('button', { name: common.allowFor(copy.rows[key].title) });

// The Allowed chip is hidden from screen readers; the row's label says "{title}, Allowed".
const allowedRows = () => screen.queryAllByLabelText(new RegExp(`, ${common.allowed}$`));
const allowedRow = (key: PermissionKey) =>
  screen.getByLabelText(`${copy.rows[key].title}, ${common.allowed}`);

beforeEach(async () => {
  jest.clearAllMocks();
  await resetFirstRun();
  for (const key of keys) mockStatus[key] = 'ask';
  mockRequest.mockResolvedValue('done');
});

test('shows the six rows with their true status', async () => {
  mockStatus.contacts = 'allowed';
  mockStatus.sms = 'blocked';
  await render(<Permissions />);
  await waitFor(() => expect(allowedRow('contacts')).toBeTruthy());
  expect(allowedRows()).toHaveLength(1);
  for (const key of keys) expect(screen.getByText(copy.rows[key].title)).toBeTruthy();
  // Blocked still says Allow (it opens settings).
  expect(allowButton('sms')).toBeEnabled();
  expect(screen.queryByRole('button', { name: common.allowFor(copy.rows.contacts.title) })).toBeNull();
  expect(screen.getAllByText(common.allow)).toHaveLength(5);
});

test('an in-app prompt refreshes the row when it closes', async () => {
  await render(<Permissions />);
  await waitFor(() => expect(allowButton('microphone')).toBeEnabled());
  mockRequest.mockImplementation(async () => {
    mockStatus.microphone = 'allowed';
    return 'done';
  });
  await fireEvent.press(allowButton('microphone'));
  await waitFor(() => expect(allowedRow('microphone')).toBeTruthy());
  expect(mockRequest).toHaveBeenCalledWith('microphone');
});

test('a system screen disables the pills until the app is active again, then refreshes', async () => {
  await render(<Permissions />);
  await waitFor(() => expect(allowButton('notifications')).toBeEnabled());
  mockRequest.mockResolvedValue('opened');
  await fireEvent.press(allowButton('notifications'));
  await waitFor(() => expect(allowButton('sms')).toBeDisabled());

  mockStatus.notifications = 'allowed';
  await act(async () => appStateListener('background'));
  expect(allowButton('sms')).toBeDisabled();
  await act(async () => appStateListener('active'));
  await waitFor(() => expect(allowedRow('notifications')).toBeTruthy());
  expect(allowButton('sms')).toBeEnabled();
});

test('location allowed with a saved home registers the geofence', async () => {
  const home = { address: 'A', lat: 1, lng: 2, radius_m: 150, wifi_ssid: null, llm_url: 'http://x.lan' };
  useFirstRunStore.getState().set({ home });
  await render(<Permissions />);
  await waitFor(() => expect(allowButton('location')).toBeEnabled());
  expect(syncHomeGeofence).not.toHaveBeenCalled();

  mockStatus.location = 'allowed';
  await act(async () => appStateListener('active'));
  await waitFor(() => expect(syncHomeGeofence).toHaveBeenCalledWith(home));
});

test.each([copy.finish, copy.skip])('"%s" ends first run into Home and records skipped rows', async (label) => {
  mockStatus.location = 'allowed';
  mockStatus.contacts = 'allowed';
  await render(<Permissions />);
  await waitFor(() => expect(allowedRows()).toHaveLength(2));
  await fireEvent.press(screen.getByRole('button', { name: label }));
  expect(mockReplace).toHaveBeenCalledWith('/home');
  const state = useFirstRunStore.getState();
  expect(state.firstRunDone).toBe(true);
  expect(state.permissionsDone).toBe(true);
  expect(state.permissionsSkipped).toEqual(['notifications', 'sms', 'microphone', 'background']);
});
