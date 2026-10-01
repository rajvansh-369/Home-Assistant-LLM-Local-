// 2.3 Profiles, 5.1's Profiles row and 2.1 without Guest (docs/aster-profiles-memory-plan.md P2).
// Against the mock server, which answers GET /profiles/{id} and Guest's switch as Laravel does.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Settings from '@/app/(tabs)/settings';
import Profiles from '@/app/profiles';
import WhoIsUsing from '@/app/who';
import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { loadProfiles, unlockProfile } from '@/features/profiles/actions';
import { profilesScreen as copy, whoIsUsing } from '@/features/profiles/copy';
import { useManageStore } from '@/features/profiles/manage';
import { useProfilesStore } from '@/features/profiles/store';
import { settings as settingsCopy } from '@/features/settings/copy';
import { api, ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: {
      push: (...args: unknown[]) => mockPush(...args),
      replace: (...args: unknown[]) => mockReplace(...args),
      back: jest.fn(),
      canGoBack: () => true,
    },
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
    Redirect: ({ href }: { href: string }) => {
      mockReplace(href);
      return null;
    },
  };
});

const server = 'https://aster.test';
const wait = { timeout: 3000 };
const guestSwitch = () => screen.queryByRole('switch', { name: copy.allowGuest });

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  mockPush.mockClear();
  mockReplace.mockClear();
  useManageStore.getState().set({ details: {}, detailsSupported: true });
  await resetFirstRun();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
  await unlockOwner('123456');
  finishFirstRun([]);
  await loadProfiles(); // as 2.1 does
});

afterEach(() => jest.restoreAllMocks());

test('2.3 lists every profile with its role, summary and the privacy notes', async () => {
  await render(<Profiles />);

  await waitFor(() => expect(screen.getByText('PIN · Chat · History kept')).toBeTruthy(), wait);
  expect(screen.getByText(copy.intro)).toBeTruthy();
  expect(screen.getByText('Test Owner')).toBeTruthy();
  expect(screen.getByText(copy.you)).toBeTruthy();
  expect(screen.getByText(copy.ownerDetail(false))).toBeTruthy();
  expect(screen.getByText('Test Member')).toBeTruthy();
  expect(screen.getByText(copy.guestDetail)).toBeTruthy();
  // The seeded Owner has "Lock when I leave" on: 2 minutes.
  expect(screen.getByText(copy.autoLock(2))).toBeTruthy();
  expect(guestSwitch()).toBeTruthy();
});

test('"Allow guest sessions" off reaches Laravel and hides Guest on 2.1', async () => {
  await render(<Profiles />);
  await waitFor(() => expect(guestSwitch()).toBeTruthy(), wait);

  await fireEvent.press(guestSwitch()!);
  await waitFor(() => expect(guestSwitch()!.props.accessibilityState.checked).toBe(false), wait);
  const deviceProfiles = useProfilesStore.getState().profiles;
  expect(deviceProfiles.find((p) => p.role === 'guest')?.chat_enabled).toBe(false);

  const { serverUrl } = useFirstRunStore.getState();
  const guestId = deviceProfiles.find((p) => p.role === 'guest')!.id;
  const owner = useFirstRunStore.getState().session!.profileToken;
  expect((await mockApi.getProfile(serverUrl!, owner, guestId)).chat_enabled).toBe(false);

  await render(<WhoIsUsing />);
  await waitFor(
    () => expect(screen.getByRole('button', { name: 'Test Member, Member' })).toBeTruthy(),
    wait,
  );
  expect(
    screen.queryByRole('button', { name: `${whoIsUsing.guest}, ${whoIsUsing.guestNote}` }),
  ).toBeNull();
});

test('a refused switch is put back with a note', async () => {
  await render(<Profiles />);
  await waitFor(() => expect(guestSwitch()).toBeTruthy(), wait);
  jest.spyOn(api, 'updateProfile').mockRejectedValueOnce(new ApiError(0, 'Network request failed'));

  await fireEvent.press(guestSwitch()!);
  await waitFor(() => expect(screen.getByText(copy.saveFailed)).toBeTruthy(), wait);
  expect(guestSwitch()!.props.accessibilityState.checked).toBe(true);
});

test('without GET /profiles/{id} (older Laravel): "PIN" only and no Guest switch', async () => {
  jest
    .spyOn(api, 'getProfile')
    .mockRejectedValue(new ApiError(405, 'The GET method is not supported.'));
  await render(<Profiles />);

  await waitFor(() => expect(useManageStore.getState().detailsSupported).toBe(false), wait);
  expect(screen.getByText('PIN')).toBeTruthy();
  expect(guestSwitch()).toBeNull();
});

test('5.1 shows Profiles with the count to the Owner only', async () => {
  await render(<Settings />);
  const row = screen.getByRole('button', { name: settingsCopy.profiles });
  expect(screen.getByText('3')).toBeTruthy();
  await fireEvent.press(row);
  expect(mockPush).toHaveBeenCalledWith('/profiles');

  await unlockProfile(
    useProfilesStore.getState().profiles.find((p) => p.role === 'member')!.id,
    '222222',
  );
  await render(<Settings />);
  expect(screen.queryByRole('button', { name: settingsCopy.profiles })).toBeNull();
});

test('2.3 sends anyone but the Owner back to Settings', async () => {
  await unlockProfile(
    useProfilesStore.getState().profiles.find((p) => p.role === 'member')!.id,
    '222222',
  );
  await render(<Profiles />);
  expect(mockReplace).toHaveBeenCalledWith('/settings');
});
