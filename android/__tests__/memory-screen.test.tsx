// 5.2 Memory and activity and 5.1's Privacy rows (docs/aster-profiles-memory-plan.md P4). Laravel
// is the mock server; zypherLL's memory routes are a small fake behind setMemoryFetch.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Settings from '@/app/(tabs)/settings';
import Memory from '@/app/memory';
import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { useHomeModeStore } from '@/features/home-mode/store';
import { memory as copy } from '@/features/memory/copy';
import { useMemoryStore } from '@/features/memory/memory';
import { loadProfiles, openGuestSession, unlockProfile } from '@/features/profiles/actions';
import { useProfilesStore } from '@/features/profiles/store';
import { settings as settingsCopy } from '@/features/settings/copy';
import { mockApi, setMockLatency } from '@/services/api/mock';
import { setMemoryFetch } from '@/services/llm/memory';

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
const home = {
  address: 'Maple Court',
  lat: 18.52,
  lng: 73.85,
  radius_m: 150,
  wifi_ssid: null,
  llm_url: 'http://192.168.1.20:8000',
};

/** A tiny zypherLL: notes and counts in memory; 403 while `off`. */
const zypher = {
  off: false,
  notes: [] as { id: number; a: string }[],
  exchanges: 37,
  nextId: 100,
  calls: [] as string[],
};

function fakeZypher(url: string, init: { method: string; body?: string }) {
  const path = new URL(url).pathname;
  zypher.calls.push(`${init.method} ${path}`);
  const reply = (status: number, body: unknown) =>
    Promise.resolve({ ok: status < 300, status, text: async () => JSON.stringify(body) });
  if (zypher.off) return reply(403, { detail: 'memory is off for this profile' });
  if (init.method === 'GET' && path === '/v1/memory') {
    return reply(200, {
      stats: { ready: true, notes: zypher.notes.length, exchanges: zypher.exchanges, rated: 6 },
    });
  }
  if (init.method === 'GET' && path === '/v1/memory/records') {
    return reply(200, { total: zypher.notes.length, records: [...zypher.notes].reverse() });
  }
  if (init.method === 'POST' && path === '/v1/memory/notes') {
    const note = { id: zypher.nextId++, kind: 'note', a: JSON.parse(init.body!).text };
    zypher.notes.push(note);
    return reply(200, note);
  }
  if (init.method === 'DELETE' && path === '/v1/memory') {
    const removed = zypher.notes.length + zypher.exchanges;
    zypher.notes = [];
    zypher.exchanges = 0;
    return reply(200, { removed });
  }
  if (init.method === 'DELETE') {
    const id = Number(path.split('/').pop());
    zypher.notes = zypher.notes.filter((n) => n.id !== id);
    return reply(200, { removed: 1 });
  }
  return reply(404, { detail: 'Not Found' });
}

const atHome = () => useHomeModeStore.getState().set({ mode: { kind: 'ready', busy: false } });
const away = () => useHomeModeStore.getState().set({ mode: { kind: 'away', distanceM: null } });

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  mockPush.mockClear();
  mockReplace.mockClear();
  Object.assign(zypher, {
    off: false,
    notes: [
      { id: 1, a: 'Works 10 to 7.' },
      { id: 2, a: 'Likes short answers.' },
    ],
    exchanges: 37,
    calls: [],
  });
  setMemoryFetch(fakeZypher as never);
  useMemoryStore.getState().set({ canClearLog: true, activityLoaded: null, activity: [] });
  away();
  await resetFirstRun();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
  await unlockOwner('123456');
  useFirstRunStore.getState().set({ home });
  finishFirstRun([]);
  await loadProfiles();
});

afterAll(() => setMemoryFetch(null));
afterEach(() => jest.restoreAllMocks());

test('away: the activity log, no memory, and the at-home note', async () => {
  const device = await mockApi.login(server, {
    email: 'family@example.test',
    password: 'pw',
    device_name: 'Other phone',
  });
  await mockApi.postActivity(server, device.token, [
    {
      client_uuid: 'e1',
      type: 'arrived_home',
      summary: 'Arrived home, assistant turned on',
      occurred_at: new Date().toISOString(),
    },
  ]);
  await render(<Memory />);

  await waitFor(
    () => expect(screen.getByText('Arrived home, assistant turned on')).toBeTruthy(),
    wait,
  );
  expect(screen.getByText(copy.today)).toBeTruthy();
  expect(screen.getByText(copy.atHomeOnly)).toBeTruthy();
  expect(screen.queryByText(copy.notes)).toBeNull();
  expect(zypher.calls).toEqual([]);

  const alert = jest.spyOn(Alert, 'alert');
  await fireEvent.press(screen.getByRole('button', { name: copy.clearLog }));
  await act(async () => alert.mock.calls[0][2]!.find((b) => b.style === 'destructive')!.onPress!());
  await waitFor(() => expect(screen.getByText(copy.noActivity)).toBeTruthy(), wait);
});

test('at home: notes, forget one, add one, learned answers and forget everything', async () => {
  atHome();
  await render(<Memory />);

  await waitFor(() => expect(screen.getByText('Works 10 to 7.')).toBeTruthy(), wait);
  expect(screen.getByText(copy.learnedCount(37))).toBeTruthy();
  expect(screen.getByText(copy.ratedCount(6))).toBeTruthy();
  expect(screen.queryByText(copy.atHomeOnly)).toBeNull();

  await fireEvent.press(screen.getAllByRole('button', { name: copy.forget })[1]);
  await waitFor(() => expect(screen.queryByText('Works 10 to 7.')).toBeNull(), wait);
  expect(zypher.notes.map((n) => n.a)).toEqual(['Likes short answers.']);

  await fireEvent.press(screen.getByRole('button', { name: copy.addNote }));
  await fireEvent.changeText(screen.getByLabelText(copy.addNote), 'Planning a trip in December.');
  await fireEvent.press(screen.getByLabelText(copy.saveNote));
  await waitFor(() => expect(screen.getByText('Planning a trip in December.')).toBeTruthy(), wait);

  const alert = jest.spyOn(Alert, 'alert');
  await fireEvent.press(screen.getByRole('button', { name: copy.forgetAll }));
  await act(async () => alert.mock.calls[0][2]!.find((b) => b.style === 'destructive')!.onPress!());
  await waitFor(() => expect(screen.getByText(copy.noNotes)).toBeTruthy(), wait);
  expect(screen.getByText(copy.learnedCount(0))).toBeTruthy();
});

test('"Remember things about me" off reaches Laravel; the home PC then says memory is off', async () => {
  atHome();
  await render(<Memory />);
  await waitFor(() => expect(screen.getByText('Works 10 to 7.')).toBeTruthy(), wait);

  zypher.off = true;
  await fireEvent.press(screen.getByRole('switch', { name: copy.rememberMe }));
  await waitFor(() => expect(screen.getByText(copy.memoryOff)).toBeTruthy(), wait);
  const { session } = useFirstRunStore.getState();
  expect(session?.profile.memory_enabled).toBe(false);
  expect((await mockApi.getMe(server, session!.profileToken)).memory_enabled).toBe(false);
});

test('5.1: Memory and activity for every profile but Guest', async () => {
  await render(<Settings />);
  await fireEvent.press(screen.getByRole('button', { name: settingsCopy.memory }));
  expect(mockPush).toHaveBeenCalledWith('/memory');

  const member = useProfilesStore.getState().profiles.find((p) => p.role === 'member')!;
  await unlockProfile(member.id, '222222');
  await render(<Settings />);
  expect(screen.getByRole('button', { name: settingsCopy.memory })).toBeTruthy();
  expect(screen.queryByRole('button', { name: settingsCopy.profiles })).toBeNull();

  await openGuestSession();
  await render(<Settings />);
  expect(screen.queryByRole('button', { name: settingsCopy.memory })).toBeNull();
  await render(<Memory />);
  // SessionGate keeps Guest in its own chat; 5.2 never shows.
  expect(screen.queryByText(copy.title)).toBeNull();
});
