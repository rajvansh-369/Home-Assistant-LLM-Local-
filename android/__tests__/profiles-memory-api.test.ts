// Profiles, /me, activity and zypherLL memory calls (docs/aster-profiles-memory-plan.md P1): the
// real client's URLs, tokens and shapes against a fake fetch, the mock server's Laravel rules, and
// the memory client against a fake zypherLL.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { realApi } from '@/services/api/client';
import { mockApi, resetMockServer, setMockLatency } from '@/services/api/mock';
import { ApiError } from '@/services/api/types';
import {
  addNote,
  forgetAll,
  forgetRecord,
  listNotes,
  MemoryError,
  memoryOverview,
  setMemoryFetch,
} from '@/services/llm/memory';

const server = 'https://aster.test';

type Init = { method: string; headers: Record<string, string>; body?: string };

function fakeFetch() {
  const mock = jest.fn();
  const answer = (status: number, body?: unknown) =>
    mock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    });
  const call = (n: number) => {
    const [url, init] = mock.mock.calls[n] as [string, Init];
    return { url, method: init.method, auth: init.headers.Authorization, body: init.body };
  };
  return { mock, answer, call };
}

describe('real client', () => {
  const { mock, answer, call } = fakeFetch();

  beforeEach(() => {
    mock.mockReset();
    globalThis.fetch = mock as unknown as typeof fetch;
  });

  test('profiles: get one, add with the Owner token, change, delete', async () => {
    const profile = { id: 5, name: 'Asha', color: '#C7AFF5', role: 'member', sampling: 'auto' };
    answer(200, { data: profile });
    expect(await realApi.getProfile(server, 'owner-token', 5)).toEqual(profile);
    expect(call(0)).toMatchObject({ url: `${server}/api/profiles/5`, method: 'GET' });
    expect(call(0).auth).toBe('Bearer owner-token');

    answer(201, { data: profile });
    const body = {
      name: 'Asha',
      color: '#C7AFF5',
      role: 'member' as const,
      pin: '135790',
      auto_lock_minutes: null,
    };
    await realApi.createProfile(server, 'owner-token', body);
    expect(call(1)).toMatchObject({ url: `${server}/api/profiles`, method: 'POST' });
    expect(call(1).auth).toBe('Bearer owner-token');
    expect(JSON.parse(call(1).body!)).toEqual(body);

    answer(200, { data: { ...profile, role: 'restricted' } });
    await realApi.updateProfile(server, 'owner-token', 5, { role: 'restricted' });
    expect(call(2)).toMatchObject({ url: `${server}/api/profiles/5`, method: 'PATCH' });

    answer(204);
    await realApi.deleteProfile(server, 'owner-token', 5);
    expect(call(3)).toMatchObject({ url: `${server}/api/profiles/5`, method: 'DELETE' });
  });

  test('/me, the activity log and deleting every chat', async () => {
    answer(200, { data: { id: 1, name: 'Owner', color: '#7FD9B8', role: 'owner' } });
    await realApi.getMe(server, 'p-token');
    expect(call(0)).toMatchObject({ url: `${server}/api/me`, method: 'GET' });

    answer(200, { data: { id: 1, memory_enabled: false } });
    await realApi.updateMe(server, 'p-token', { memory_enabled: false });
    expect(JSON.parse(call(1).body!)).toEqual({ memory_enabled: false });

    const page = { data: [], meta: { next_cursor: 'abc=' } };
    answer(200, page);
    expect(await realApi.listActivity(server, 'p-token')).toEqual(page);
    expect(call(2)).toMatchObject({ url: `${server}/api/activity`, method: 'GET' });
    answer(200, { data: [], meta: { next_cursor: null } });
    await realApi.listActivity(server, 'p-token', 'abc=');
    expect(call(3).url).toBe(`${server}/api/activity?cursor=abc%3D`);

    answer(204);
    await realApi.clearActivity(server, 'p-token');
    expect(call(4)).toMatchObject({ url: `${server}/api/activity`, method: 'DELETE' });

    answer(204);
    await realApi.deleteAllConversations(server, 'p-token');
    expect(call(5)).toMatchObject({ url: `${server}/api/conversations`, method: 'DELETE' });
  });

  test("a route Laravel doesn't have yet is a 404 or 405 ApiError", async () => {
    answer(405, { message: 'The GET method is not supported for route api/profiles/5.' });
    const error = await realApi.getProfile(server, 'owner-token', 5).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(405);
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

  test('the Owner adds a Member; it unlocks with its PIN; only the Owner may', async () => {
    const owner = await unlock('123456', 'Test Owner');
    const member = await unlock('222222', 'Test Member');
    const body = {
      name: ' Asha ',
      color: '#C7AFF5',
      role: 'restricted' as const,
      pin: '135790',
      auto_lock_minutes: 2,
    };
    expect((await failure(mockApi.createProfile(server, member, body))).status).toBe(403);
    expect((await failure(mockApi.createProfile(server, device, body))).status).toBe(403);
    expect(
      (await failure(mockApi.createProfile(server, owner, { ...body, pin: '12' }))).fieldErrors.pin,
    ).toBeDefined();
    expect(
      (await failure(mockApi.createProfile(server, owner, { ...body, role: 'owner' }))).fieldErrors
        .role,
    ).toBeDefined();

    const asha = await mockApi.createProfile(server, owner, body);
    expect(asha).toMatchObject({
      name: 'Asha',
      role: 'restricted',
      sampling: 'auto',
      has_pin: true,
    });
    expect((await mockApi.listProfiles(server, device)).map((p) => p.name)).toContain('Asha');
    await unlock('135790', 'Asha');
  });

  test('roles change only between member and restricted; the Owner reads every profile', async () => {
    const owner = await unlock('123456', 'Test Owner');
    const profiles = await mockApi.listProfiles(server, device);
    const ownerId = profiles.find((p) => p.role === 'owner')!.id;
    const memberId = profiles.find((p) => p.role === 'member')!.id;
    const guestId = profiles.find((p) => p.role === 'guest')!.id;

    expect(await mockApi.getProfile(server, owner, memberId)).toMatchObject({
      role: 'member',
      web_mode: 'auto',
      memory_enabled: true,
    });
    const changed = await mockApi.updateProfile(server, owner, memberId, {
      role: 'restricted',
      sampling: 'precise',
      auto_lock_minutes: null,
      history_enabled: false,
    });
    expect(changed).toMatchObject({
      role: 'restricted',
      sampling: 'precise',
      auto_lock_minutes: null,
      history_enabled: false,
    });
    expect(
      (await failure(mockApi.updateProfile(server, owner, ownerId, { role: 'member' }))).status,
    ).toBe(422);
    expect(
      (await failure(mockApi.updateProfile(server, owner, guestId, { pin: '123456' }))).status,
    ).toBe(422);
    expect(
      (await failure(mockApi.updateProfile(server, owner, memberId, { color: '#abcdef' }))).status,
    ).toBe(422);
  });

  test('deleting a profile hides it and ends its sessions; Owner and Guest stay', async () => {
    const owner = await unlock('123456', 'Test Owner');
    const member = await unlock('222222', 'Test Member');
    const profiles = await mockApi.listProfiles(server, device);
    const memberId = profiles.find((p) => p.role === 'member')!.id;
    const guestId = profiles.find((p) => p.role === 'guest')!.id;

    expect((await failure(mockApi.deleteProfile(server, member, memberId))).status).toBe(403);
    expect((await failure(mockApi.deleteProfile(server, owner, guestId))).status).toBe(422);
    await mockApi.deleteProfile(server, owner, memberId);
    expect((await mockApi.listProfiles(server, device)).map((p) => p.id)).not.toContain(memberId);
    expect((await failure(mockApi.getMe(server, member))).status).toBe(401);
    expect((await failure(mockApi.getProfile(server, owner, memberId))).status).toBe(404);
  });

  test('/me changes the profile; a new PIN needs the current one; Guest has no /me', async () => {
    const member = await unlock('222222', 'Test Member');
    expect((await mockApi.updateMe(server, member, { memory_enabled: false })).memory_enabled).toBe(
      false,
    );
    expect((await mockApi.getMe(server, member)).memory_enabled).toBe(false);
    expect(
      (await failure(mockApi.updateMe(server, member, { pin: '111111', current_pin: '000000' })))
        .fieldErrors.current_pin,
    ).toBeDefined();
    await mockApi.updateMe(server, member, { pin: '111111', current_pin: '222222' });
    await unlock('111111', 'Test Member');

    const guest = (await mockApi.guestSession(server, device)).profile_token;
    expect((await failure(mockApi.getMe(server, guest))).status).toBe(403);
  });

  test('activity: each profile its own events, the Owner also the device; clearing', async () => {
    const owner = await unlock('123456', 'Test Owner');
    const member = await unlock('222222', 'Test Member');
    const memberId = (await mockApi.listProfiles(server, device)).find(
      (p) => p.role === 'member',
    )!.id;
    await mockApi.postActivity(server, device, [
      {
        client_uuid: 'a1',
        type: 'arrived_home',
        summary: 'Arrived home',
        occurred_at: '2026-10-01T10:00:00.000Z',
      },
      {
        client_uuid: 'a2',
        profile_id: memberId,
        type: 'reminder_fired',
        summary: 'Reminder: Water the plants',
        occurred_at: '2026-10-01T11:00:00.000Z',
      },
    ]);

    const mine = await mockApi.listActivity(server, member);
    expect(mine.data.map((e) => e.summary)).toEqual(['Reminder: Water the plants']);
    expect(mine.data[0]).toMatchObject({ occurred_at: '2026-10-01T11:00:00Z', meta: {} });
    expect((await mockApi.listActivity(server, owner)).data.map((e) => e.type)).toEqual([
      'arrived_home',
    ]);

    await mockApi.clearActivity(server, member);
    expect((await mockApi.listActivity(server, member)).data).toEqual([]);
    expect((await mockApi.listActivity(server, owner)).data).toHaveLength(1);
  });

  test('deleting every chat tombstones only the profile’s own', async () => {
    const owner = await unlock('123456', 'Test Owner');
    const member = await unlock('222222', 'Test Member');
    await mockApi.createConversation(server, owner, { client_uuid: 'c1', title: 'Mine' });
    await mockApi.createConversation(server, member, { client_uuid: 'c2', title: 'Theirs' });
    await mockApi.deleteAllConversations(server, owner);
    expect((await mockApi.listConversations(server, owner)).data).toEqual([]);
    expect((await mockApi.listConversations(server, member)).data).toHaveLength(1);
  });
});

describe('zypherLL memory', () => {
  const { mock, answer, call } = fakeFetch();
  const access = {
    llmUrl: 'http://192.168.1.20:8000/',
    llmToken: 'llm-jwt',
    engine: 'local' as const,
  };

  beforeEach(() => {
    mock.mockReset();
    setMemoryFetch(mock);
  });
  afterAll(() => setMemoryFetch(null));

  test('overview and notes, with the llm_token and the engine', async () => {
    answer(200, {
      engine: 'local',
      stats: { ready: true, notes: 2, exchanges: 37, rated: 6, total: 39 },
      profile: [],
    });
    expect(await memoryOverview(access)).toEqual({
      notes: 2,
      exchanges: 37,
      rated: 6,
      ready: true,
    });
    expect(call(0)).toMatchObject({ url: 'http://192.168.1.20:8000/v1/memory?engine=local' });
    expect(call(0).auth).toBe('Bearer llm-jwt');

    answer(200, {
      total: 3,
      records: [
        {
          id: 9,
          kind: 'note',
          q: 'About the user',
          a: 'Works 10 to 7.',
          ts: '2026-10-01T10:00:00',
        },
        { id: 8, kind: 'note', category: 'notes', key: 'tea', a: 'Likes tea' },
        { id: 7, kind: 'note', a: '  ' },
      ],
    });
    expect(await listNotes(access)).toEqual([
      { id: 9, text: 'Works 10 to 7.', at: '2026-10-01T10:00:00' },
      { id: 8, text: 'Likes tea', at: null },
    ]);
    expect(call(1).url).toBe(
      'http://192.168.1.20:8000/v1/memory/records?engine=local&kind=note&limit=100',
    );
  });

  test('add, forget one and forget everything', async () => {
    answer(200, { id: 10, kind: 'note', a: 'Prefers short answers' });
    expect((await addNote(access, ' Prefers short answers ')).id).toBe(10);
    expect(call(0)).toMatchObject({ method: 'POST' });
    expect(JSON.parse(call(0).body!)).toEqual({ text: 'Prefers short answers' });

    answer(200, { removed: 1 });
    await forgetRecord(access, 10);
    expect(call(1)).toMatchObject({
      url: 'http://192.168.1.20:8000/v1/memory/10?engine=local',
      method: 'DELETE',
    });

    answer(200, { removed: 39 });
    expect(await forgetAll(access)).toBe(39);
    expect(call(2).url).toBe('http://192.168.1.20:8000/v1/memory?engine=local&selector=all');
  });

  test('errors: memory off, expired token, not loaded, no reply', async () => {
    const kind = async (promise: Promise<unknown>) => {
      const error = await promise.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(MemoryError);
      return (error as MemoryError).kind;
    };
    answer(403, { detail: 'memory is off for this profile' });
    expect(await kind(memoryOverview(access))).toBe('off');
    answer(401, { detail: 'token expired' });
    expect(await kind(listNotes(access))).toBe('unauthorized');
    answer(503, { detail: 'model not ready' });
    expect(await kind(forgetAll(access))).toBe('not-ready');
    answer(404, { detail: 'no memory with id 3' });
    expect(await kind(forgetRecord(access, 3))).toBe('not-found');
    mock.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await kind(memoryOverview(access))).toBe('no-reply');
  });
});
