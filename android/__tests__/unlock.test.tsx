import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import UnlockOwner from '@/app/(first-run)/unlock-owner';
import { resetFirstRun, signIn } from '@/features/first-run/actions';
import { unlock as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { setMockLatency } from '@/services/api/mock';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: jest.fn(),
    dismissTo: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

const wait = { timeout: 3000 };

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  mockPush.mockClear();
  await resetFirstRun();
  // The mock seeds an Owner "Test Owner" with PIN 123456 for emails starting with "owner".
  await signIn({ server: 'https://aster.test', email: 'owner@example.test', password: 'pw' });
});

async function typePin(pin: string) {
  for (const digit of pin) await fireEvent.press(screen.getByRole('button', { name: digit }));
}

test('a fresh sign-in has no biometric PIN: no fingerprint key and no hint pointing at it', async () => {
  await render(<UnlockOwner />);
  expect(screen.getByText('Test Owner')).toBeTruthy();
  expect(screen.getByText(copy.ownerBadge)).toBeTruthy();
  expect(screen.getByText(copy.prompt)).toBeTruthy();
  expect(screen.getByText(copy.lockNote)).toBeTruthy();
  expect(screen.queryByText(copy.fingerprintHint)).toBeNull();
  expect(screen.queryByRole('button', { name: copy.fingerprintKey })).toBeNull();
});

test('with a stored biometric PIN, the fingerprint key and hint show', async () => {
  useFirstRunStore.getState().set({ fingerprintEnabled: true });
  await render(<UnlockOwner />);
  expect(screen.getByText(copy.fingerprintHint)).toBeTruthy();
  expect(screen.getByRole('button', { name: copy.fingerprintKey })).toBeTruthy();
});

test('shows the Owner and submits on the 6th digit', async () => {
  await render(<UnlockOwner />);

  await typePin('12345');
  expect(screen.getByLabelText(copy.digitsEntered(5))).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: copy.deleteKey }));
  expect(screen.getByLabelText(copy.digitsEntered(4))).toBeTruthy();

  await typePin('56');
  await waitFor(() => expect(screen.getByText(copy.accepted)).toBeTruthy(), wait);
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/set-home'), wait);
});

test('a wrong PIN clears the dots and says so; the 5th locks the keypad with a countdown', async () => {
  await render(<UnlockOwner />);

  for (let attempt = 1; attempt <= 5; attempt++) {
    await typePin('000000');
    await waitFor(() => expect(screen.getByText(copy.wrongPin)).toBeTruthy(), wait);
    expect(screen.getByLabelText(copy.digitsEntered(0))).toBeTruthy();
  }

  // The 6th try hits the lock: 429 with retry_after.
  await typePin('123456');
  await waitFor(() => expect(screen.getByText(/^Locked\. Try again in \d+ s$/)).toBeTruthy(), wait);
  expect(screen.getByRole('button', { name: '1' }).props.accessibilityState).toMatchObject({
    disabled: true,
  });
  expect(mockPush).not.toHaveBeenCalled();

  const first = screen.getByText(/^Locked/).props.children as string;
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1100));
  });
  expect(screen.getByText(/^Locked/).props.children).not.toBe(first);
});
