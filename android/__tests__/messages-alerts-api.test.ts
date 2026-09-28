// Alert settings and VIP contact calls (docs/aster-messages-alerts-plan.md M1): the real client's
// URLs, tokens and shapes against a fake fetch, and the mock server's Laravel rules.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { realApi } from '@/services/api/client';
import { mockApi, resetMockServer, setMockLatency } from '@/services/api/mock';
import { ApiError, type AlertSettings } from '@/services/api/types';

const server = 'https://aster.test';

const settings: AlertSettings = {
  enabled: true,
  missed_after_minutes: 5,
  speak_mode: 'full',
  quiet_start: '23:00',
  quiet_end: '07:00',
  urgent_keywords: ['urgent', 'call me'],
  headphones_only: false,
  only_at_home: true,
};

describe('real client', () => {
  const fetchMock = jest.fn();
  const answer = (status: number, body?: unknown) =>
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    });
  const call = (n: number) => {
    const [url, init] = fetchMock.mock.calls[n];
    return { url, method: init.method, auth: init.headers.Authorization, body: init.body };
  };

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  test('alert settings use the profile token and unwrap `data`', async () => {
    answer(200, { data: { ...settings, updated_at: '2026-09-28T10:00:00Z' } });
    expect(await realApi.getAlertSettings(server, 'p-token')).toMatchObject(settings);
    expect(call(0)).toMatchObject({ url: `${server}/api/alert-settings`, method: 'GET' });
    expect(call(0).auth).toBe('Bearer p-token');

    answer(200, { data: { ...settings, speak_mode: 'name' } });
    expect(
      (await realApi.putAlertSettings(server, 'p-token', { speak_mode: 'name' })).speak_mode,
    ).toBe('name');
    expect(call(1)).toMatchObject({ url: `${server}/api/alert-settings`, method: 'PUT' });
    expect(JSON.parse(call(1).body)).toEqual({ speak_mode: 'name' });
  });

  test('VIP contacts: list, create, change and delete', async () => {
    const vip = {
      id: 4,
      name: 'Asha',
      match_key: 'Asha Kulkarni',
      sources: ['whatsapp', 'sms'],
      enabled: true,
      updated_at: '2026-09-28T10:00:00Z',
    };
    answer(200, { data: [vip] });
    expect(await realApi.listVipContacts(server, 'p-token')).toEqual([vip]);
    expect(call(0)).toMatchObject({ url: `${server}/api/vip-contacts`, method: 'GET' });

    answer(201, { data: vip });
    const body = {
      name: 'Asha',
      match_key: 'Asha Kulkarni',
      sources: ['whatsapp' as const, 'sms' as const],
      enabled: true,
    };
    expect((await realApi.createVipContact(server, 'p-token', body)).id).toBe(4);
    expect(call(1)).toMatchObject({ url: `${server}/api/vip-contacts`, method: 'POST' });
    expect(JSON.parse(call(1).body)).toEqual(body);

    answer(200, { data: { ...vip, enabled: false } });
    await realApi.updateVipContact(server, 'p-token', 4, { enabled: false });
    expect(call(2)).toMatchObject({ url: `${server}/api/vip-contacts/4`, method: 'PATCH' });
    expect(JSON.parse(call(2).body)).toEqual({ enabled: false });

    answer(204);
    await realApi.deleteVipContact(server, 'p-token', 4);
    expect(call(3)).toMatchObject({ url: `${server}/api/vip-contacts/4`, method: 'DELETE' });
  });
});

describe('mock server', () => {
  let device: string;

  async function unlock(pin: string, name: string) {
    const profiles = await mockApi.listProfiles(server, device);
    const profile = profiles.find((p) => p.name === name)!;
    return (await mockApi.unlockProfile(server, device, profile.id, pin)).profile_token;
  }

  async function failure(promise: Promise<unknown>) {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }

  beforeAll(() => setMockLatency(0, 0));
  beforeEach(async () => {
    await AsyncStorage.clear();
    await resetMockServer();
    ({ token: device } = await mockApi.login(server, {
      email: 'family@example.test',
      password: 'secret123',
      device_name: 'Test phone',
    }));
  });

  test('alert settings start at Laravel defaults and are Owner only', async () => {
    const owner = await unlock('123456', 'Test Owner');
    const member = await unlock('222222', 'Test Member');
    expect(await mockApi.getAlertSettings(server, owner)).toMatchObject({
      enabled: true,
      missed_after_minutes: 10,
      speak_mode: 'full',
      urgent_keywords: [],
    });
    expect((await failure(mockApi.getAlertSettings(server, member))).status).toBe(403);
    expect(
      (await failure(mockApi.putAlertSettings(server, owner, { missed_after_minutes: 0 }))).status,
    ).toBe(422);
    expect(
      (await failure(mockApi.putAlertSettings(server, owner, { quiet_start: '25:00' }))).status,
    ).toBe(422);
    const saved = await mockApi.putAlertSettings(server, owner, {
      quiet_start: '23:00',
      quiet_end: '07:00',
    });
    expect(saved).toMatchObject({ quiet_start: '23:00', quiet_end: '07:00', enabled: true });
  });

  test('VIP contacts need a name, a match key and a source; deletes hide them', async () => {
    const owner = await unlock('123456', 'Test Owner');
    const missing = await failure(
      mockApi.createVipContact(server, owner, {
        name: 'Asha',
        match_key: 'Asha',
        sources: [],
        enabled: true,
      }),
    );
    expect(missing.fieldErrors.sources).toBeDefined();

    const vip = await mockApi.createVipContact(server, owner, {
      name: 'Asha',
      match_key: 'Asha Kulkarni',
      sources: ['whatsapp'],
      enabled: true,
    });
    expect(
      (await mockApi.updateVipContact(server, owner, vip.id, { enabled: false })).enabled,
    ).toBe(false);
    expect(await mockApi.listVipContacts(server, owner)).toHaveLength(1);
    await mockApi.deleteVipContact(server, owner, vip.id);
    expect(await mockApi.listVipContacts(server, owner)).toEqual([]);
    expect((await failure(mockApi.deleteVipContact(server, owner, vip.id))).status).toBe(404);
  });
});
