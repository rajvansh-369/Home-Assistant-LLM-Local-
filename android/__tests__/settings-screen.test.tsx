import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Settings from '@/app/settings';
import { resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { settings as copy } from '@/features/settings/copy';
import { setMockLatency } from '@/services/api/mock';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: () => mockBack(),
    canGoBack: () => true,
    replace: jest.fn(),
    push: jest.fn(),
  },
}));

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  mockBack.mockClear();
  await resetFirstRun();
  await signIn({ server: 'https://aster.test', email: 'owner@example.test', password: 'pw' });
  await unlockOwner('123456');
});

test('lists both engines with Local picked', async () => {
  await render(<Settings />);

  expect(screen.getByRole('header', { name: copy.title })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Local, Offline' }).props.accessibilityState).toMatchObject({
    checked: true,
  });
  expect(screen.getByRole('radio', { name: 'Mark-L, Online' }).props.accessibilityState).toMatchObject({
    checked: false,
  });
  expect(screen.getByText(copy.homeWifi)).toBeTruthy();
});

test('shows the name the admin panel gave Mark-L', async () => {
  useFirstRunStore.getState().set({
    engines: [
      { id: 'local', name: 'Local' },
      { id: 'markl', name: 'Aster Pro' },
    ],
  });
  await render(<Settings />);

  expect(screen.getByRole('radio', { name: 'Aster Pro, Online' })).toBeTruthy();
});

test('picking Mark-L while unlocked saves it', async () => {
  await render(<Settings />);

  fireEvent.press(screen.getByRole('radio', { name: 'Mark-L, Online' }));

  await waitFor(() => expect(screen.getByText(copy.saved)).toBeTruthy());
  expect(useFirstRunStore.getState().llmEngine).toBe('markl');
  expect(screen.getByRole('radio', { name: 'Mark-L, Online' }).props.accessibilityState).toMatchObject({
    checked: true,
  });
});

test('picking while locked says it syncs at the next unlock', async () => {
  useFirstRunStore.getState().set({ session: null });
  await render(<Settings />);

  fireEvent.press(screen.getByRole('radio', { name: 'Mark-L, Online' }));

  await waitFor(() => expect(screen.getByText(copy.pending)).toBeTruthy());
  expect(useFirstRunStore.getState().llmEngineSynced).toBe(false);
});

test('back goes back', async () => {
  await render(<Settings />);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockBack).toHaveBeenCalled();
});
