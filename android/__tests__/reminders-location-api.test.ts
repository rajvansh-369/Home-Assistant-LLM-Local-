// Reminders and location calls (docs/aster-reminders-location-plan.md R1): the real client's
// URLs, tokens and shapes against a fake fetch, and the mock server's Laravel rules.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { realApi } from '@/services/api/client';
import { mockApi, resetMockServer, setMockLatency } from '@/services/api/mock';
import { ApiError } from '@/services/api/types';

const server = 'https://aster.test';

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

  const reminder = {
    id: 7,
    client_uuid: '1b4e28ba-2fa1-4d3b-9a5c-2f6b7e0e1a11',
    title: 'Call the plumber',
    due_at: '2026-09-28T15:30:00Z',
    trigger: 'time',
    status: 'pending',
    created_at: '2026-09-27T10:00:00Z',
    updated_at: '2026-09-27T10:00:00Z',
  };

  test('reminders use the profile token and unwrap `data`', async () => {
    answer(200, { data: [reminder] });
    expect(await realApi.listReminders(server, 'p-token')).toEqual([reminder]);
    expect(call(0)).toMatchObject({ url: `${server}/api/reminders`, method: 'GET' });
    expect(call(0).auth).toBe('Bearer p-token');

    answer(201, { data: reminder });
    const body = {
      client_uuid: reminder.client_uuid,
      title: reminder.title,
      trigger: 'time' as const,
      due_at: reminder.due_at,
    };
    expect(await realApi.createReminder(server, 'p-token', body)).toEqual(reminder);
    expect(call(1)).toMatchObject({ url: `${server}/api/reminders`, method: 'POST' });
    expect(JSON.parse(call(1).body)).toEqual(body);

    answer(200, { data: { ...reminder, status: 'done' } });
    await realApi.updateReminder(server, 'p-token', 7, { status: 'done' });
    expect(call(2)).toMatchObject({ url: `${server}/api/reminders/7`, method: 'PATCH' });
    expect(JSON.parse(call(2).body)).toEqual({ status: 'done' });

    answer(204);
    await realApi.deleteReminder(server, 'p-token', 7);
    expect(call(3)).toMatchObject({ url: `${server}/api/reminders/7`, method: 'DELETE' });
  });

  test('batches use the device token and return the flat counts', async () => {
    const point = {
      client_uuid: '2c5f39cb-3ab2-4e4c-8b6d-3a7c8f1f2b22',
      lat: 18.52,
      lng: 73.85,
      accuracy_m: 20,
      event: 'periodic' as const,
      recorded_at: '2026-09-27T10:00:00Z',
    };
    answer(200, { accepted: 1, duplicates: 0, discarded: 0 });
    expect(await realApi.postLocations(server, 'd-token', [point])).toEqual({
      accepted: 1,
      duplicates: 0,
      discarded: 0,
    });
    expect(call(0)).toMatchObject({ url: `${server}/api/locations/batch`, method: 'POST' });
    expect(call(0).auth).toBe('Bearer d-token');
    expect(JSON.parse(call(0).body)).toEqual({ points: [point] });

    const event = {
      client_uuid: '3d6a4adc-4bc3-4f5d-9c7e-4b8d9a2a3c33',
      type: 'arrived_home',
      summary: 'Arrived home',
      occurred_at: '2026-09-27T10:00:00Z',
    };
    answer(200, { accepted: 1, duplicates: 0 });
    await realApi.postActivity(server, 'd-token', [event]);
    expect(call(1)).toMatchObject({ url: `${server}/api/activity/batch`, method: 'POST' });
    expect(JSON.parse(call(1).body)).toEqual({ events: [event] });
  });

  test('a day of points is asked for with the date and zone in the query', async () => {
    answer(200, { data: [], meta: { date: '2026-09-27', tz: 'Asia/Kolkata', count: 0 } });
    const day = await realApi.getLocations(server, 'p-token', '2026-09-27', 'Asia/Kolkata');
    expect(day.meta.count).toBe(0);
    expect(call(0).url).toBe(`${server}/api/locations?date=2026-09-27&tz=Asia%2FKolkata`);
  });

  test('location settings are read and changed with PUT', async () => {
    const settings = {
      enabled: true,
      interval_minutes: 15,
      retention_days: 30,
      share_area: false,
      paused_until: null,
    };
    answer(200, { data: settings });
    expect(await realApi.getLocationSettings(server, 'p-token')).toEqual(settings);
    answer(200, { data: { ...settings, share_area: true } });
    await realApi.putLocationSettings(server, 'p-token', { share_area: true });
    expect(call(1)).toMatchObject({ url: `${server}/api/location-settings`, method: 'PUT' });
    expect(JSON.parse(call(1).body)).toEqual({ share_area: true });
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

  test('reminders are per profile and idempotent by client_uuid', async () => {
    const owner = await unlock('123456', 'Test Owner');
    const member = await unlock('222222', 'Test Member');
    const body = {
      client_uuid: '4e7b5bed-5cd4-4a6e-8d8f-5c9eab3b4d44',
      title: 'Water the plants',
      trigger: 'time' as const,
      due_at: '2026-09-28T10:15:30.123Z',
    };
    const created = await mockApi.createReminder(server, owner, body);
    expect(created.due_at).toBe('2026-09-28T10:15:30Z');
    expect((await mockApi.createReminder(server, owner, body)).id).toBe(created.id);
    expect(await mockApi.listReminders(server, member)).toEqual([]);
    expect((await failure(mockApi.createReminder(server, member, body))).status).toBe(422);
    expect((await failure(mockApi.deleteReminder(server, member, created.id))).status).toBe(404);
  });

  test('a time reminder needs due_at; Guest gets 403', async () => {
    const owner = await unlock('123456', 'Test Owner');
    const missing = await failure(
      mockApi.createReminder(server, owner, {
        client_uuid: '5f8c6cfe-6de5-4b7f-9e9a-6daf8c4c5e55',
        title: 'No time',
        trigger: 'time',
        due_at: null,
      }),
    );
    expect(missing.messageFor('due_at')).toBe('A time reminder needs a due_at.');

    const { profile_token: guest } = await mockApi.guestSession(server, device);
    expect((await failure(mockApi.listReminders(server, guest))).status).toBe(403);
  });

  test('points are stored per day and discarded while paused', async () => {
    const owner = await unlock('123456', 'Test Owner');
    const point = (uuid: string, at: string) => ({
      client_uuid: uuid,
      lat: 18.5,
      lng: 73.8,
      event: 'periodic' as const,
      recorded_at: at,
    });
    const first = point('6a9d7d0f-7ef6-4c8a-8fab-7eb09d5d6f66', '2026-09-26T20:00:00Z');
    expect(await mockApi.postLocations(server, device, [first])).toEqual({
      accepted: 1,
      duplicates: 0,
      discarded: 0,
    });
    // 20:00 UTC on the 26th is 01:30 on the 27th in Kolkata.
    expect(
      (await mockApi.getLocations(server, owner, '2026-09-27', 'Asia/Kolkata')).meta.count,
    ).toBe(1);
    expect((await mockApi.getLocations(server, owner, '2026-09-26', 'UTC')).meta.count).toBe(1);

    await mockApi.putLocationSettings(server, owner, {
      paused_until: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const second = point('7bae8e1a-8fa7-4d9b-9abc-8fc1ae6e7a77', '2026-09-26T21:00:00Z');
    expect(await mockApi.postLocations(server, device, [first, second])).toEqual({
      accepted: 0,
      duplicates: 1,
      discarded: 1,
    });
  });

  test('location settings and days are Owner only; ranges are checked', async () => {
    const owner = await unlock('123456', 'Test Owner');
    const member = await unlock('222222', 'Test Member');
    expect((await failure(mockApi.getLocationSettings(server, member))).status).toBe(403);
    expect((await failure(mockApi.getLocations(server, member, '2026-09-27', 'UTC'))).status).toBe(
      403,
    );
    const tooShort = await failure(
      mockApi.putLocationSettings(server, owner, { interval_minutes: 5 }),
    );
    expect(tooShort.status).toBe(422);
    expect(
      (await mockApi.putLocationSettings(server, owner, { retention_days: 7 })).retention_days,
    ).toBe(7);
  });

  test('activity rejects a profile outside the household', async () => {
    const event = {
      client_uuid: '8cbf9f2b-9ab8-4eac-8bcd-9ad2bf7f8b88',
      type: 'reminder_fired',
      summary: 'Reminder rang',
      occurred_at: '2026-09-27T10:00:00Z',
    };
    expect((await mockApi.postActivity(server, device, [event])).accepted).toBe(1);
    expect((await mockApi.postActivity(server, device, [event])).duplicates).toBe(1);
    const stranger = {
      ...event,
      client_uuid: '9dc0a03c-0bc9-4fbd-9cde-0be3ca8a9c99',
      profile_id: 999,
    };
    expect((await failure(mockApi.postActivity(server, device, [stranger]))).status).toBe(422);
  });
});
