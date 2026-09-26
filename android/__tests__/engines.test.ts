import AsyncStorage from '@react-native-async-storage/async-storage';

import { resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { pickPersisted, useFirstRunStore } from '@/features/first-run/store';
import { chooseLlmEngine } from '@/features/settings/actions';
import { DEFAULT_ENGINES } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';
import { getDeviceToken } from '@/services/secure';

const server = 'https://aster.test';
const store = () => useFirstRunStore.getState();

/** The engine Laravel (the mock server) has for the Owner, read through a fresh unlock. */
async function serverEngine() {
  const token = (await getDeviceToken())!;
  const unlocked = await mockApi.unlockProfile(server, token, store().owner!.id, '123456');
  return unlocked.profile.llm_engine;
}

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  await resetFirstRun();
  await AsyncStorage.clear();
  await signIn({ server, email: 'owner@example.test', password: 'pw' });
});

test('unlock keeps the engine names across restarts and starts on Local', async () => {
  await unlockOwner('123456');

  expect(store().engines).toEqual(DEFAULT_ENGINES);
  expect(pickPersisted(store()).engines).toEqual(DEFAULT_ENGINES);
  expect(pickPersisted(store()).llmEngine).toBe('local');
  // The session holds tokens only.
  expect(Object.keys(store().session!).sort()).toEqual(['expiresAt', 'llmToken', 'profileToken']);
});

test('choosing while unlocked saves to the server at once', async () => {
  await unlockOwner('123456');

  await expect(chooseLlmEngine('markl')).resolves.toBe('saved');

  expect(store().llmEngine).toBe('markl');
  expect(store().llmEngineSynced).toBe(true);
  expect(await serverEngine()).toBe('markl');
});

test('choosing while locked keeps it on the phone and sends it at the next unlock', async () => {
  store().set({ session: null });

  await expect(chooseLlmEngine('markl')).resolves.toBe('pending');
  expect(store().llmEngine).toBe('markl');
  expect(store().llmEngineSynced).toBe(false);

  await unlockOwner('123456');

  expect(store().llmEngineSynced).toBe(true);
  expect(store().llmEngine).toBe('markl');
  expect(await serverEngine()).toBe('markl');
});

test('with nothing pending, unlock takes the engine chosen on another phone', async () => {
  await unlockOwner('123456');
  const { session, owner } = store();
  await mockApi.updateProfile(server, session!.profileToken, owner!.id, { llm_engine: 'markl' });
  expect(store().llmEngine).toBe('local');

  await unlockOwner('123456');

  expect(store().llmEngine).toBe('markl');
});
