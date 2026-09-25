import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import CreateOwner from '@/app/(first-run)/create-owner';
import { createOwner, resetFirstRun, startRegistration } from '@/features/first-run/actions';
import { common, createOwner as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: jest.fn(),
    dismissTo: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
}));

const auth = jest.mocked(LocalAuthentication);
const wait = { timeout: 3000 };
const server = 'https://aster.test';

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  jest.restoreAllMocks();
  mockPush.mockClear();
  auth.hasHardwareAsync.mockResolvedValue(true);
  auth.isEnrolledAsync.mockResolvedValue(true);
  await resetFirstRun();
  // Register mode: 1.2 Continue carried the credentials here in memory.
  startRegistration({ server, email: 'new@example.test', password: 'long-enough' });
});

const submitButton = (label: string = copy.submit) => screen.getByRole('button', { name: label });

async function fillIn(name: string, pin: string) {
  await fireEvent.changeText(screen.getByLabelText(copy.nameLabel), name);
  await fireEvent.changeText(screen.getByLabelText(copy.pinLabel), pin);
}

test('shows the §4.3 copy with both switches on', async () => {
  await render(<CreateOwner />);
  expect(screen.getByText(copy.title)).toBeTruthy();
  expect(screen.getByText(copy.subtitle)).toBeTruthy();
  expect(screen.getByText(copy.pinHelper)).toBeTruthy();
  expect(screen.getByText(copy.lockWhenLeaveSubtitle)).toBeTruthy();
  expect(screen.getByRole('radio', { name: common.colourNames.mint })).toBeChecked();
  await waitFor(() => expect(screen.getByRole('switch', { name: copy.fingerprint })).toBeChecked());
  expect(screen.getByRole('switch', { name: copy.lockWhenLeave })).toBeChecked();
});

test('Create profile needs a name and a 6-digit PIN; the PIN keeps digits only', async () => {
  await render(<CreateOwner />);
  expect(submitButton()).toBeDisabled();

  await fillIn('   ', '123456');
  expect(submitButton()).toBeDisabled();

  await fillIn('Asha', '12a3-45');
  expect(screen.getByLabelText(copy.pinLabel).props.value).toBe('12345');
  expect(submitButton()).toBeDisabled();

  await fireEvent.changeText(screen.getByLabelText(copy.pinLabel), '123456');
  expect(submitButton()).toBeEnabled();
});

test('the avatar shows the first letter in the chosen colour', async () => {
  await render(<CreateOwner />);
  await fireEvent.changeText(screen.getByLabelText(copy.nameLabel), 'asha');
  // The avatar is decorative, so it's hidden from screen readers.
  expect(screen.queryByText('A')).toBeNull();
  expect(screen.getByText('A', { includeHiddenElements: true })).toBeTruthy();
  await fireEvent.press(screen.getByRole('radio', { name: common.colourNames.sky }));
  expect(screen.getByRole('radio', { name: common.colourNames.sky })).toBeChecked();
  expect(screen.getByRole('radio', { name: common.colourNames.mint })).not.toBeChecked();
});

test('no enrolled fingerprint: the switch is off and disabled, with the reason', async () => {
  auth.isEnrolledAsync.mockResolvedValue(false);
  await render(<CreateOwner />);
  await waitFor(() => expect(screen.getByText(copy.noFingerprint)).toBeTruthy());
  const fingerprint = screen.getByRole('switch', { name: copy.fingerprint });
  expect(fingerprint).not.toBeChecked();
  expect(fingerprint).toBeDisabled();
});

test('Create profile runs register, create and unlock, then moves to 1.4', async () => {
  await render(<CreateOwner />);
  await fillIn('Asha', '246810');
  await fireEvent.press(screen.getByRole('switch', { name: copy.fingerprint }));
  await fireEvent.press(submitButton());
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/set-home'), wait);
  const state = useFirstRunStore.getState();
  expect(state.owner).toMatchObject({ name: 'Asha', color: 'mint' });
  expect(state.hasDeviceToken).toBe(true);
  expect(state.fingerprintEnabled).toBe(false);
});

test.each([
  [new ApiError(500, 'Server Error'), common.somethingWrong],
  [new ApiError(0, 'Network request failed'), common.noConnection],
])('a server failure shows a next step above the button (%p)', async (error, message) => {
  jest.spyOn(mockApi, 'createProfile').mockRejectedValueOnce(error);
  await render(<CreateOwner />);
  await fillIn('Asha', '246810');
  await fireEvent.press(submitButton());
  await waitFor(() => expect(screen.getByText(message)).toBeTruthy(), wait);
  expect(mockPush).not.toHaveBeenCalled();
  expect(submitButton()).toBeEnabled();
});

test('coming back after the Owner exists: Save profile, PIN locked', async () => {
  await createOwner({
    name: 'Asha',
    color: 'peach',
    pin: '246810',
    fingerprint: false,
    lockWhenLeave: true,
  });
  const update = jest.spyOn(mockApi, 'updateProfile');
  await render(<CreateOwner />);

  expect(screen.getByLabelText(copy.nameLabel).props.value).toBe('Asha');
  expect(screen.getByRole('radio', { name: common.colourNames.peach })).toBeChecked();
  expect(screen.getByLabelText(copy.pinLabel)).toBeDisabled();
  expect(screen.getByText(copy.pinLocked)).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText(copy.nameLabel), 'Asha R');
  await fireEvent.press(submitButton(copy.save));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/set-home'), wait);
  expect(update).toHaveBeenCalledTimes(1);
  expect(useFirstRunStore.getState().owner?.name).toBe('Asha R');
});
