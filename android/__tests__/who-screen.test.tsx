import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import UnlockProfile from '@/app/unlock/[id]';
import WhoIsUsing from '@/app/who';
import { resetFirstRun, signIn } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { loadProfiles } from '@/features/profiles/actions';
import { whoIsUsing as copy } from '@/features/profiles/copy';
import { useProfilesStore } from '@/features/profiles/store';
import { setMockLatency } from '@/services/api/mock';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: {
      push: (...args: unknown[]) => mockPush(...args),
      replace: (...args: unknown[]) => mockReplace(...args),
      back: jest.fn(),
      canGoBack: () => true,
      canDismiss: () => false,
      dismissAll: jest.fn(),
    },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    Redirect: ({ href }: { href: string }) => {
      mockReplace(href);
      return null;
    },
  };
});

const wait = { timeout: 3000 };

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  mockPush.mockClear();
  mockReplace.mockClear();
  await resetFirstRun();
  await signIn({ server: 'https://aster.test', email: 'family@example.test', password: 'pw' });
});

test('2.1 lists the profiles with their roles, then Guest', async () => {
  await render(<WhoIsUsing />);

  expect(screen.getByRole('header', { name: copy.title })).toBeTruthy();
  await waitFor(
    () => expect(screen.getByRole('button', { name: 'Test Member, Member' })).toBeTruthy(),
    wait,
  );
  expect(screen.getByRole('button', { name: 'Test Owner, Owner' })).toBeTruthy();
  expect(screen.getByRole('button', { name: `${copy.guest}, ${copy.guestNote}` })).toBeTruthy();
});

test('a profile opens 2.2 for that profile', async () => {
  await render(<WhoIsUsing />);
  await waitFor(() => screen.getByRole('button', { name: 'Test Member, Member' }), wait);

  await fireEvent.press(screen.getByRole('button', { name: 'Test Member, Member' }));

  const member = useProfilesStore.getState().profiles.find((p) => p.role === 'member')!;
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/unlock/[id]', params: { id: member.id } });
});

test('Guest opens a Guest session and 2.5', async () => {
  await render(<WhoIsUsing />);
  await waitFor(
    () => screen.getByRole('button', { name: `${copy.guest}, ${copy.guestNote}` }),
    wait,
  );

  await fireEvent.press(screen.getByRole('button', { name: `${copy.guest}, ${copy.guestNote}` }));

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/guest'), wait);
  expect(useFirstRunStore.getState().session?.profile.role).toBe('guest');
});

test('2.2 unlocks a Member and goes Home', async () => {
  const member = (await loadProfiles()).profiles.find((p) => p.role === 'member')!;
  mockParams = { id: String(member.id) };
  await render(<UnlockProfile />);

  expect(screen.getByRole('header', { name: 'Test Member' })).toBeTruthy();
  // Only the Owner can have the fingerprint key.
  expect(screen.queryByRole('button', { name: 'Unlock with fingerprint' })).toBeNull();
  for (const digit of '222222') await fireEvent.press(screen.getByRole('button', { name: digit }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'), wait);
  expect(useFirstRunStore.getState().session?.profile.name).toBe('Test Member');
});

test('2.2 without a known profile goes back to 2.1', async () => {
  mockParams = { id: '9999' };
  await render(<UnlockProfile />);
  expect(mockReplace).toHaveBeenCalledWith('/who');
});
