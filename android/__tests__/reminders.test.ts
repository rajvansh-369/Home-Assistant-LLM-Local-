// Reminders (docs/aster-reminders-location-plan.md §4, R2): the store, the upload queue, the
// merge with Laravel, alarms and ringing, the notification buttons, and the device queue for
// activity events. Against the mock server and the in-memory expo-notifications mock.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { resetFirstRun, signIn } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import {
  flushDeviceUploads,
  queuePoints,
  readDeviceUploads,
  resetDeviceUploadsRuntime,
} from '@/features/location/uploads';
import { loadProfiles, lockSession, unlockProfile } from '@/features/profiles/actions';
import {
  addReminder,
  armArriveHome,
  deleteReminder,
  editReminder,
  handleAlarmResponse,
  markDone,
  resetHandledResponses,
  ringArriveHome,
  snooze,
} from '@/features/reminders/actions';
import { reconcileAlarms, resetAlarmsRuntime, snoozeId } from '@/features/reminders/alarms';
import { comingUp, dueLabel, quickTimes } from '@/features/reminders/format';
import { flushReminderQueue, resetReminderQueueRunner } from '@/features/reminders/queue';
import {
  REMINDERS_KEY,
  resetRemindersRuntime,
  useRemindersStore,
  type LocalReminder,
  type SavedReminders,
} from '@/features/reminders/store';
import { mergeReminders, syncReminders } from '@/features/reminders/sync';
import { api, ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';
import { ACTION_DONE, ACTION_SNOOZE, ACTION_OPEN } from '@/services/notifications';

type NotificationsMock = typeof Notifications & {
  __scheduled: Map<
    string,
    { content: { title: string; body: string; subtitle: string }; trigger: { date: Date } }
  >;
  __presented: Map<string, { content: { title: string; body: string } }>;
  __reset: () => void;
};
const notifications = Notifications as NotificationsMock;

const server = 'https://aster.test';
const reminders = () => useRemindersStore.getState().reminders;
const queue = () => useRemindersStore.getState().queue;
const session = () => useFirstRunStore.getState().session!;
const HOUR = 60 * 60 * 1000;

let ownerId: number;
let memberId: number;

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  await flushReminderQueue();
};

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  jest.restoreAllMocks();
  notifications.__reset();
  resetRemindersRuntime();
  resetReminderQueueRunner();
  resetAlarmsRuntime();
  resetDeviceUploadsRuntime();
  resetHandledResponses();
  await resetFirstRun();
  await AsyncStorage.clear();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
  const { profiles } = await loadProfiles();
  ownerId = profiles.find((p) => p.role === 'owner')!.id;
  memberId = profiles.find((p) => p.role === 'member')!.id;
  await unlockProfile(ownerId, '123456');
});

const time = (msFromNow: number) => ({
  title: 'Call the plumber',
  trigger: 'time' as const,
  dueAt: new Date(Date.now() + msFromNow),
});
const home = { title: 'Water the plants', trigger: 'arrive_home' as const, dueAt: null };

describe('time reminders', () => {
  test('added: saved, scheduled with its time and profile, and uploaded', async () => {
    const uuid = await addReminder(time(2 * HOUR), false);
    await settle();

    const reminder = reminders()[uuid];
    expect(reminder).toMatchObject({
      status: 'pending',
      profileId: ownerId,
      serverId: expect.any(Number),
    });
    const alarm = notifications.__scheduled.get(uuid)!;
    expect(alarm.trigger.date.getTime()).toBe(Date.parse(reminder.dueAt!));
    expect(alarm.content).toMatchObject({
      title: 'Call the plumber',
      subtitle: 'Test Owner',
      body: expect.stringMatching(/^You asked me to remind you at \d{1,2}:\d{2} [AP]M\.$/),
    });

    const onServer = await mockApi.listReminders(server, session().profileToken);
    expect(onServer).toEqual([
      expect.objectContaining({ client_uuid: uuid, trigger: 'time', status: 'pending' }),
    ]);
    expect(queue()).toEqual([]);
    expect(JSON.parse((await AsyncStorage.getItem(REMINDERS_KEY))!).reminders[uuid]).toBeDefined();
  });

  test('edited to a new time: the alarm moves and Laravel gets the change', async () => {
    const uuid = await addReminder(time(2 * HOUR), false);
    await settle();
    const later = new Date(Date.now() + 5 * HOUR);
    await editReminder(
      uuid,
      { title: 'Call the electrician', trigger: 'time', dueAt: later },
      false,
    );
    await settle();

    expect(notifications.__scheduled.get(uuid)!.trigger.date.getTime()).toBe(
      Math.floor(later.getTime() / 1000) * 1000,
    );
    const [onServer] = await mockApi.listReminders(server, session().profileToken);
    expect(onServer.title).toBe('Call the electrician');
  });

  test('done: the alarm stops, Laravel hears it, and the phone forgets it', async () => {
    const uuid = await addReminder(time(HOUR), false);
    await settle();
    await markDone(uuid);
    await settle();

    expect(notifications.__scheduled.has(uuid)).toBe(false);
    const [onServer] = await mockApi.listReminders(server, session().profileToken);
    expect(onServer.status).toBe('done');
    expect(reminders()[uuid]).toBeUndefined();
  });

  test('deleted before upload: nothing reaches Laravel; after upload: Laravel deletes it', async () => {
    jest
      .spyOn(api, 'createReminder')
      .mockRejectedValueOnce(new ApiError(0, 'Network request failed'));
    const unsent = await addReminder(time(HOUR), false);
    await settle();
    // The create failed and waits to retry.
    expect(queue()).toHaveLength(1);
    await deleteReminder(unsent);
    expect(queue()).toHaveLength(0);
    await settle();
    expect(await mockApi.listReminders(server, session().profileToken)).toEqual([]);

    const sent = await addReminder(time(HOUR), false);
    await settle();
    await deleteReminder(sent);
    await settle();
    expect(await mockApi.listReminders(server, session().profileToken)).toEqual([]);
    expect(notifications.__scheduled.size).toBe(0);
  });

  test('snooze rings 30 minutes later; Laravel keeps it pending', async () => {
    const uuid = await addReminder(time(HOUR), false);
    await settle();
    const now = new Date();
    await snooze(uuid, now);

    const again = notifications.__scheduled.get(snoozeId(uuid))!;
    expect(again.trigger.date.getTime()).toBe(
      Math.floor((now.getTime() + 30 * 60 * 1000) / 1000) * 1000,
    );
    expect(again.content.title).toBe('Call the plumber');
    await settle();
    const [onServer] = await mockApi.listReminders(server, session().profileToken);
    expect(onServer.status).toBe('pending');
  });

  test('deleted while its upload is on the way: Laravel deletes it too', async () => {
    const create = jest.spyOn(api, 'createReminder');
    let uuid = '';
    create.mockImplementationOnce(async (...args) => {
      const created = await mockApi.createReminder(...args);
      await deleteReminder(uuid);
      return created;
    });
    uuid = await addReminder(time(HOUR), false);
    await settle();
    expect(await mockApi.listReminders(server, session().profileToken)).toEqual([]);
  });

  test('a reminder that came due is logged once as reminder_fired, without its title', async () => {
    const uuid = await addReminder(time(HOUR), false);
    await settle();
    jest.spyOn(api, 'postActivity').mockRejectedValue(new ApiError(0, 'Network request failed'));

    await reconcileAlarms(() => Date.now() + 2 * HOUR);
    await reconcileAlarms(() => Date.now() + 3 * HOUR);

    expect(reminders()[uuid].firedAt).toBe(reminders()[uuid].dueAt);
    const { events } = await readDeviceUploads();
    expect(events).toEqual([
      expect.objectContaining({
        type: 'reminder_fired',
        profile_id: ownerId,
        meta: { trigger: 'time' },
        summary: 'Reminder rang',
      }),
    ]);
    expect(JSON.stringify(events)).not.toContain('plumber');
  });

  test('jobs wait for their own profile to be unlocked', async () => {
    jest
      .spyOn(api, 'createReminder')
      .mockRejectedValueOnce(new ApiError(0, 'Network request failed'));
    const uuid = await addReminder(time(HOUR), false);
    await settle();
    lockSession();
    await unlockProfile(memberId, '222222');
    await flushReminderQueue(() => Date.now() + 60_000);
    expect(queue()).toHaveLength(1);
    expect(reminders()[uuid].serverId).toBeNull();

    lockSession();
    await unlockProfile(ownerId, '123456');
    await flushReminderQueue(() => Date.now() + 60_000);
    expect(queue()).toHaveLength(0);
    expect(reminders()[uuid].serverId).not.toBeNull();
  });
});

describe('arrive-home reminders', () => {
  test('made at home: waits for a departure, rings at the next arrival, once', async () => {
    const uuid = await addReminder(home, true);
    await ringArriveHome();
    expect(notifications.__presented.size).toBe(0);

    await armArriveHome();
    await ringArriveHome();
    expect(notifications.__presented.get(uuid)!.content).toMatchObject({
      title: 'Water the plants',
      body: 'You asked me to remind you when you got home.',
    });
    notifications.__presented.clear();
    await ringArriveHome();
    expect(notifications.__presented.size).toBe(0);
    expect((await readDeviceUploads()).events.at(-1)).toMatchObject({
      type: 'reminder_fired',
      meta: { trigger: 'arrive_home' },
    });
  });

  test('made away: rings at the first arrival', async () => {
    const uuid = await addReminder(home, false);
    await ringArriveHome();
    expect(notifications.__presented.has(uuid)).toBe(true);
  });
});

describe('notification buttons', () => {
  test('Done and Snooze act; a repeat is ignored; a tap returns the reminder', async () => {
    const uuid = await addReminder(time(HOUR), false);
    await settle();
    const response = (actionIdentifier: string, date = 1) => ({
      actionIdentifier,
      notification: { date, request: { identifier: uuid, content: { data: { reminder: uuid } } } },
    });

    expect(await handleAlarmResponse(response(ACTION_OPEN))).toBe(uuid);
    await handleAlarmResponse(response(ACTION_SNOOZE));
    expect(notifications.__scheduled.has(snoozeId(uuid))).toBe(true);

    await handleAlarmResponse(response(ACTION_DONE, 2));
    await handleAlarmResponse(response(ACTION_DONE, 2));
    await settle();
    expect(notifications.__scheduled.size).toBe(0);
    const [onServer] = await mockApi.listReminders(server, session().profileToken);
    expect(onServer.status).toBe('done');
  });

  test('a snooze button with no data still finds its reminder', async () => {
    const uuid = await addReminder(time(HOUR), false);
    await handleAlarmResponse({
      actionIdentifier: ACTION_DONE,
      notification: { request: { identifier: snoozeId(uuid), content: {} } },
    });
    expect(reminders()[uuid].status).toBe('done');
  });
});

describe('sync with Laravel', () => {
  const local = (patch: Partial<LocalReminder>): LocalReminder => ({
    clientUuid: 'a',
    serverId: 1,
    profileId: 5,
    profileName: 'Owner',
    title: 'Local',
    trigger: 'time',
    dueAt: '2026-10-01T10:00:00Z',
    status: 'pending',
    armed: false,
    firedAt: null,
    snoozedUntil: null,
    createdAt: '2026-09-27T10:00:00Z',
    updatedAt: '2026-09-27T10:00:00Z',
    ...patch,
  });
  const remote = (id: number, uuid: string, patch: Record<string, unknown> = {}) => ({
    id,
    client_uuid: uuid,
    title: 'Remote',
    due_at: '2026-10-01T10:00:00Z',
    trigger: 'time' as const,
    status: 'pending' as const,
    created_at: '2026-09-27T10:00:00Z',
    updated_at: '2026-09-28T10:00:00Z',
    ...patch,
  });
  const saved = (
    reminders: LocalReminder[],
    queue: SavedReminders['queue'] = [],
  ): SavedReminders => ({
    reminders: Object.fromEntries(reminders.map((r) => [r.clientUuid, r])),
    queue,
    alarms: {},
  });
  const profile = { id: 5, name: 'Owner' };

  test("Laravel's copy wins unless jobs are waiting", () => {
    const merged = mergeReminders(saved([local({})]), profile, [remote(1, 'a')], false);
    expect(merged.a.title).toBe('Remote');

    const job = {
      id: 'j',
      reminder: 'a',
      profileId: 5,
      attempts: 0,
      nextAt: 0,
      kind: 'update' as const,
    };
    const kept = mergeReminders(saved([local({})], [job]), profile, [remote(1, 'a')], false);
    expect(kept.a.title).toBe('Local');
  });

  test('deleted elsewhere, done elsewhere, and not uploaded yet', () => {
    const merged = mergeReminders(
      saved([
        local({ clientUuid: 'gone', serverId: 2 }),
        local({ clientUuid: 'done', serverId: 3 }),
        local({ clientUuid: 'new', serverId: null }),
        local({ clientUuid: 'other', serverId: 4, profileId: 6 }),
      ]),
      profile,
      [remote(3, 'done', { status: 'done' })],
      false,
    );
    expect(Object.keys(merged).sort()).toEqual(['new', 'other']);
  });

  test('a new arrive-home reminder is armed only when the phone is away', () => {
    const arriving = remote(9, 'h', { trigger: 'arrive_home', due_at: null });
    expect(mergeReminders(saved([]), profile, [arriving], true).h.armed).toBe(false);
    expect(mergeReminders(saved([]), profile, [arriving], false).h.armed).toBe(true);
  });

  test('a reminder added on another phone arrives with its alarm', async () => {
    await mockApi.createReminder(server, session().profileToken, {
      client_uuid: '0ac1b14d-1cda-4e0e-8def-1cf4db9bad10',
      title: 'From the other phone',
      trigger: 'time',
      due_at: new Date(Date.now() + HOUR).toISOString(),
    });
    await syncReminders();
    expect(reminders()['0ac1b14d-1cda-4e0e-8def-1cf4db9bad10'].title).toBe('From the other phone');
    expect(notifications.__scheduled.has('0ac1b14d-1cda-4e0e-8def-1cf4db9bad10')).toBe(true);
  });
});

describe('device queue', () => {
  const point = (uuid: string) => ({
    client_uuid: uuid,
    lat: 18.5,
    lng: 73.8,
    event: 'periodic' as const,
    recorded_at: '2026-09-27T10:00:00Z',
  });

  test('points go out with the device token and leave the queue', async () => {
    await queuePoints([point('1d2e3f40-2b3c-4d5e-8f60-718293a4b5c6')]);
    await flushDeviceUploads();
    expect((await readDeviceUploads()).points).toEqual([]);
    const owner = session().profileToken;
    expect((await mockApi.getLocations(server, owner, '2026-09-27', 'UTC')).meta.count).toBe(1);
  });

  test('no reply keeps them; a 422 drops the batch and says why', async () => {
    const post = jest.spyOn(api, 'postLocations');
    post.mockRejectedValueOnce(new ApiError(0, 'Network request failed'));
    await queuePoints([point('2e3f4051-3c4d-4e5f-9061-8293a4b5c6d7')]);
    await flushDeviceUploads();
    expect((await readDeviceUploads()).points).toHaveLength(1);

    post.mockRejectedValueOnce(new ApiError(422, 'The points.0.lat field is required.'));
    await flushDeviceUploads();
    const uploads = await readDeviceUploads();
    expect(uploads.points).toEqual([]);
    expect(uploads.lastError).toBe('422 The points.0.lat field is required.');
  });
});

describe('format', () => {
  const at = (h: number, m = 0, dayOffset = 0) =>
    new Date(2026, 8, 27 + dayOffset, h, m).toISOString();
  const now = new Date(2026, 8, 27, 12, 0);

  test('due labels follow the canvas', () => {
    expect(dueLabel(at(21), now)).toBe('9:00 PM');
    expect(dueLabel(at(10, 0, 1), now)).toBe('Tomorrow 10:00');
    expect(dueLabel(at(10, 0, 3), now)).toBe('Wed 10:00');
    expect(dueLabel(at(10, 0, 9), now)).toBe('6 Oct 10:00');
  });

  test('Coming up puts arrive-home first only when away', () => {
    const base = { status: 'pending' as const, createdAt: '2026-09-27T00:00:00Z' } as LocalReminder;
    const list = [
      { ...base, clientUuid: 'late', trigger: 'time' as const, dueAt: at(22) },
      { ...base, clientUuid: 'home', trigger: 'arrive_home' as const, dueAt: null },
      { ...base, clientUuid: 'soon', trigger: 'time' as const, dueAt: at(13) },
      {
        ...base,
        clientUuid: 'done',
        trigger: 'time' as const,
        dueAt: at(14),
        status: 'done' as const,
      },
    ];
    expect(comingUp(list, true).map((r) => r.clientUuid)).toEqual(['soon', 'late', 'home']);
    expect(comingUp(list, false).map((r) => r.clientUuid)).toEqual(['home', 'soon', 'late']);
  });

  test('quick picks: no "Tonight" after 8 PM', () => {
    expect(quickTimes(new Date(2026, 8, 27, 19, 59)).tonight).not.toBeNull();
    expect(quickTimes(new Date(2026, 8, 27, 20, 0)).tonight).toBeNull();
    expect(quickTimes(now).tomorrowMorning).toEqual(new Date(2026, 8, 28, 9, 0));
  });
});
