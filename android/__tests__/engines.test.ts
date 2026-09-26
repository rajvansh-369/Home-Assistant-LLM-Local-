import AsyncStorage from '@react-native-async-storage/async-storage';

import { resetFirstRun } from '@/features/first-run/actions';
import { mockApi, setMockLatency } from '@/services/api/mock';

const server = 'https://aster.test';

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  await resetFirstRun();
  await AsyncStorage.clear();
});

test('unlock lists the engines, Local first, and a profile can switch to Mark-L', async () => {
  const { token } = await mockApi.login(server, {
    email: 'owner@example.test',
    password: 'pw',
    device_name: 't',
  });
  const [profile] = await mockApi.listProfiles(server, token);
  const session = await mockApi.unlockProfile(server, token, profile.id, '123456');

  expect(session.engines).toEqual([
    { id: 'local', name: 'Local' },
    { id: 'markl', name: 'Mark-L' },
  ]);

  const updated = await mockApi.updateProfile(server, session.profile_token, profile.id, {
    llm_engine: 'markl',
  });
  expect(updated.llm_engine).toBe('markl');
});
