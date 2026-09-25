import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  bootFirstRun,
  createOwner,
  currentFirstRunRoute,
  finishFirstRun,
  resetFirstRun,
  saveHome,
  signIn,
  startRegistration,
  unlockOwner,
} from '@/features/first-run/actions';
import { FIRST_RUN_STORAGE_KEY, useFirstRunStore } from '@/features/first-run/store';
import { ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';
import { getDeviceToken } from '@/services/secure';

const server = 'https://aster.test';
const home = {
  address: '1 Test Street',
  lat: 1,
  lng: 2,
  radius_m: 150,
  wifi_ssid: null,
  llm_url: 'http://10.0.0.5:8000',
};
const owner = { name: 'Test', color: 'sky' as const, fingerprint: false, lockWhenLeave: true };

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  await resetFirstRun();
  await AsyncStorage.clear();
});

async function persistedJson(): Promise<string> {
  // zustand persist writes asynchronously; let it flush.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return (await AsyncStorage.getItem(FIRST_RUN_STORAGE_KEY)) ?? '';
}

test('the persisted slice never contains a token, PIN or password', async () => {
  startRegistration({ server, email: 'new@example.test', password: 'secret-password' });
  await createOwner({ ...owner, pin: '482913' });
  await saveHome(home);

  const state = useFirstRunStore.getState();
  expect(state.session?.profileToken).toBeTruthy();

  const json = await persistedJson();
  expect(json).toContain('new@example.test');
  const stored = JSON.parse(json).state as Record<string, unknown>;
  expect(Object.keys(stored).sort()).toEqual(
    [
      'email',
      'fingerprintEnabled',
      'firstRunDone',
      'home',
      'lockWhenLeave',
      'owner',
      'permissionsDone',
      'permissionsSkipped',
      'serverUrl',
    ].sort(),
  );
  const secrets = [
    'secret-password',
    '482913',
    state.session!.profileToken,
    state.session!.llmToken,
    (await getDeviceToken())!,
  ];
  for (const secret of secrets) expect(json).not.toContain(secret);
  expect(json).not.toMatch(/token|password|"pin/i);
});

test('new household: register, create Owner, unlock, save home, finish', async () => {
  expect(currentFirstRunRoute()).toBe('/welcome');
  expect(startRegistration({ server, email: 'a@example.test', password: 'long-enough' })).toBe(
    '/create-owner',
  );
  expect(await createOwner({ ...owner, pin: '111111' })).toBe('/set-home');
  expect(useFirstRunStore.getState().pendingRegistration).toBeNull();
  expect(await saveHome(home)).toBe('/permissions');
  finishFirstRun();
  expect(currentFirstRunRoute()).toBe('/home');
});

test('existing household with an Owner goes to unlock, and resumes there after a restart', async () => {
  expect(await signIn({ server, email: 'owner@example.test', password: 'pw' })).toBe(
    '/unlock-owner',
  );

  // Simulate a kill: memory is gone; persisted facts and the device token remain.
  useFirstRunStore.getState().set({ session: null, booted: false, hasDeviceToken: false });
  await bootFirstRun();
  expect(currentFirstRunRoute()).toBe('/unlock-owner');

  await expect(unlockOwner('000000')).rejects.toMatchObject({ status: 422 });
  expect(await unlockOwner('123456')).toBe('/set-home');
});

test('register mode after a restart falls back to sign in', async () => {
  startRegistration({ server, email: 'b@example.test', password: 'long-enough' });
  useFirstRunStore.getState().set({ pendingRegistration: null });
  expect(currentFirstRunRoute()).toBe('/sign-in');
  expect(await createOwner({ ...owner, pin: '111111' })).toBe('/sign-in');
});

describe('mock server errors (plan §6)', () => {
  test('wrong password gives 422, throttle gives 429 with retry_after', async () => {
    const body = { email: 'x@example.test', device_name: 'test' };
    await expect(mockApi.login(server, { ...body, password: 'wrong' })).rejects.toMatchObject({
      status: 422,
    });
    await expect(mockApi.login(server, { ...body, password: 'throttle' })).rejects.toMatchObject({
      status: 429,
      retryAfter: 30,
    });
  });

  test('register is refused once the household exists', async () => {
    const body = { name: 'A', email: 'a@example.test', password: 'long-enough', device_name: 't' };
    await mockApi.register(server, body);
    await expect(mockApi.register(server, body)).rejects.toMatchObject({ status: 403 });
  });

  test('five wrong PINs lock unlock for 30 s with 429', async () => {
    const { token } = await mockApi.login(server, {
      email: 'owner@example.test',
      password: 'pw',
      device_name: 't',
    });
    const [profile] = await mockApi.listProfiles(server, token);
    for (let i = 0; i < 5; i++) {
      await expect(
        mockApi.unlockProfile(server, token, profile.id, '999999'),
      ).rejects.toMatchObject({ status: 422 });
    }
    const locked = await mockApi.unlockProfile(server, token, profile.id, '123456').catch((e) => e);
    expect(locked).toBeInstanceOf(ApiError);
    expect(locked.status).toBe(429);
    expect(locked.retryAfter).toBeGreaterThan(0);
    expect(locked.retryAfter).toBeLessThanOrEqual(30);
  });
});
