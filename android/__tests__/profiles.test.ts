import AsyncStorage from '@react-native-async-storage/async-storage';

import { resetFirstRun, signIn, SignedOutError } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import {
  GUEST_AUTO_END_MINUTES,
  loadProfiles,
  lockSession,
  openGuestSession,
  shouldLock,
  unlockProfile,
} from '@/features/profiles/actions';
import { useProfilesStore } from '@/features/profiles/store';
import { ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';
import * as secure from '@/services/secure';

const server = 'https://aster.test';
const store = () => useFirstRunStore.getState();
const MIN = 60_000;

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  jest.restoreAllMocks();
  await resetFirstRun();
  await AsyncStorage.clear();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
});

describe('loadProfiles', () => {
  test('caches the list: Owner first, Guest last', async () => {
    const { profiles, fresh } = await loadProfiles();

    expect(fresh).toBe(true);
    expect(profiles.map((p) => [p.name, p.role])).toEqual([
      ['Test Owner', 'owner'],
      ['Test Member', 'member'],
      ['Guest', 'guest'],
    ]);
    expect(useProfilesStore.getState().profiles).toEqual(profiles);
  });

  test('offline, the cached list comes back as stale', async () => {
    await loadProfiles();
    jest
      .spyOn(mockApi, 'listProfiles')
      .mockRejectedValueOnce(new ApiError(0, 'Network request failed'));

    const { profiles, fresh } = await loadProfiles();

    expect(fresh).toBe(false);
    expect(profiles).toHaveLength(3);
  });

  test('a 401 signs the phone out', async () => {
    jest
      .spyOn(mockApi, 'listProfiles')
      .mockRejectedValueOnce(new ApiError(401, 'Unauthenticated.'));

    await expect(loadProfiles()).rejects.toBeInstanceOf(SignedOutError);
    expect(await secure.getDeviceToken()).toBeNull();
  });
});

describe('sessions', () => {
  test('a Member unlocks with its own PIN and gets its own engine', async () => {
    const { profiles } = await loadProfiles();
    const member = profiles.find((p) => p.role === 'member')!;

    await expect(unlockProfile(member.id, '000000')).rejects.toMatchObject({ status: 422 });
    await unlockProfile(member.id, '222222');

    expect(store().session?.profile).toMatchObject({ name: 'Test Member', role: 'member' });
    expect(store().llmEngineProfileId).toBe(member.id);
    // The Owner facts from first run stay the Owner's.
    expect(store().owner?.name).toBe('Test Owner');
  });

  test('the Owner unlocks through the first-run path', async () => {
    await loadProfiles();
    await unlockProfile(store().owner!.id, '123456');
    expect(store().session?.profile.role).toBe('owner');
  });

  test('Guest opens without a PIN, and lock forgets the session and tells Laravel', async () => {
    await openGuestSession();
    const session = store().session!;
    expect(session.profile.role).toBe('guest');

    const lock = jest.spyOn(mockApi, 'lockProfile');
    lockSession();

    expect(store().session).toBeNull();
    expect(lock).toHaveBeenCalledWith(server, session.profileToken, session.profile.id);
  });
});

describe('shouldLock', () => {
  const now = Date.parse('2026-09-27T12:00:00Z');
  const session = (
    role: 'owner' | 'member' | 'guest',
    autoLock: number | null,
    expiresIn = 60 * MIN,
  ) => ({
    profileToken: 'p',
    llmToken: 'l',
    expiresAt: new Date(now + expiresIn).toISOString(),
    profile: { id: 1, name: 'A', color: '#7FD9B8', role, auto_lock_minutes: autoLock },
  });

  test.each([
    ['no session', null, now - 10 * MIN, false],
    ['never went to the background', session('owner', 2), null, false],
    ['1 minute away with a 2 minute lock', session('owner', 2), now - MIN, false],
    ['2 minutes away with a 2 minute lock', session('owner', 2), now - 2 * MIN, true],
    ['no auto-lock, an hour away', session('member', null), now - 60 * MIN, false],
    ['the token expired', session('member', null, -1), null, true],
    [
      'Guest ends after its own limit',
      session('guest', null),
      now - GUEST_AUTO_END_MINUTES * MIN,
      true,
    ],
  ])('%s', (_name, value, backgroundedAt, expected) => {
    expect(shouldLock(value, backgroundedAt, now)).toBe(expected);
  });
});
