// 3.4 Chat and 2.5 Guest against a fake zypherLL stream (expo/fetch) and the mock Laravel.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { fetch as expoFetch } from 'expo/fetch';

import Chat from '@/app/chat/[id]';
import Guest from '@/app/guest';
import { installChatSession } from '@/features/chat/actions';
import { chat as copy } from '@/features/chat/copy';
import { flushQueue, resetQueueRunner } from '@/features/chat/queue';
import { useChatStore } from '@/features/chat/store';
import { resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { useHomeModeStore } from '@/features/home-mode/store';
import * as area from '@/features/location/area';
import { openGuestSession } from '@/features/profiles/actions';
import { guest as guestCopy } from '@/features/profiles/copy';
import { mockApi, setMockLatency } from '@/services/api/mock';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/features/home-mode/controller', () => ({ checkHomeMode: jest.fn(async () => {}) }));

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: {
    back: () => mockBack(),
    canGoBack: () => true,
    replace: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
  Redirect: () => null,
}));

const fetchMock = jest.mocked(expoFetch) as unknown as jest.Mock;
const encoder = new TextEncoder();
const wait = { timeout: 3000 };

const sse = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
const text = (content: string) =>
  sse({ choices: [{ index: 0, delta: { content }, finish_reason: null }] });
const done = (finish: string, zypher: Record<string, unknown> = {}) =>
  sse({ choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: null, zypher }) +
  'data: [DONE]\n\n';

/** A stream that hands out `parts` one read at a time; `hold` stops before the part at that index until released. */
function stream(
  parts: string[],
  hold?: { at: number; signal?: AbortSignal; release?: Promise<void> },
) {
  let i = 0;
  return {
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      getReader: () => ({
        read: async () => {
          if (hold && i === hold.at) {
            await Promise.race([
              hold.release ?? new Promise(() => {}),
              new Promise((_, reject) =>
                hold.signal?.addEventListener('abort', () =>
                  reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
                ),
              ),
            ]);
          }
          if (i >= parts.length) return { done: true };
          return { done: false, value: encoder.encode(parts[i++]) };
        },
      }),
    },
  };
}

const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)[1].body);

async function ask(question: string) {
  await fireEvent.changeText(screen.getByLabelText(copy.placeholder), question);
  await fireEvent.press(screen.getByRole('button', { name: copy.send }));
}

beforeAll(() => {
  setMockLatency(0, 0);
  installChatSession();
});

beforeEach(async () => {
  fetchMock.mockReset();
  mockBack.mockClear();
  resetQueueRunner();
  await resetFirstRun();
  await signIn({ server: 'https://aster.test', email: 'owner@example.test', password: 'pw' });
  await unlockOwner('123456');
  useFirstRunStore.getState().set({
    home: {
      address: 'x',
      lat: 1,
      lng: 2,
      radius_m: 150,
      wifi_ssid: null,
      llm_url: 'http://10.0.2.2:8000',
    },
  });
  useHomeModeStore.setState({ mode: { kind: 'ready', busy: false } });
  mockParams = { id: 'new' };
});

test('a new chat streams the answer, then saves the turn to Laravel', async () => {
  fetchMock.mockResolvedValueOnce(
    stream([
      sse({ choices: [{ delta: {} }], zypher: { stage: 'recalled', count: 2 } }),
      text('Try paneer '),
      text('bhurji wraps.'),
      done('stop', { memory_id: 7, live: false, sources: [] }),
    ]),
  );
  await render(<Chat />);

  await ask('Suggest a quick dinner with paneer.');

  expect(await screen.findByText('Try paneer bhurji wraps.', {}, wait)).toBeTruthy();
  // The question is the bubble and, as the chat's title, the header.
  expect(screen.getAllByText('Suggest a quick dinner with paneer.')).toHaveLength(2);
  expect(screen.getByRole('header', { name: 'Suggest a quick dinner with paneer.' })).toBeTruthy();
  expect(lastBody()).toMatchObject({ engine: 'local', web: 'auto', stream: true });
  expect(lastBody()).not.toHaveProperty('memory');

  const [chat] = Object.values(useChatStore.getState().chats);
  expect(chat.title).toBe('Suggest a quick dinner with paneer.');
  await flushQueue();
  await waitFor(() => expect(useChatStore.getState().queue).toEqual([]), wait);
  const session = useFirstRunStore.getState().session!;
  const stored = await mockApi.listMessages(
    'https://aster.test',
    session.profileToken,
    useChatStore.getState().chats[chat.clientUuid].serverId!,
  );
  expect(stored.data.map((m) => m.content)).toEqual([
    'Suggest a quick dinner with paneer.',
    'Try paneer bhurji wraps.',
  ]);
  expect(stored.data[1]).toMatchObject({ memory_id: 7, finish_reason: 'stop' });
});

test('web answers show the search, the sources and the live note; rating calls zypherLL', async () => {
  const rate = jest.fn(async () => ({ ok: true, status: 200 }));
  globalThis.fetch = rate as unknown as typeof fetch;
  fetchMock.mockResolvedValueOnce(
    stream([
      text('About 1.5 hours [1].'),
      done('stop', {
        memory_id: 9,
        live: true,
        cited: true,
        sources: [{ n: 1, title: 'Pune to Lonavala', url: 'https://www.example.test/drive' }],
      }),
    ]),
  );
  await render(<Chat />);
  await ask('How long from Pune to Lonavala?');

  expect(await screen.findByText(copy.searched(1), {}, wait)).toBeTruthy();
  expect(screen.getByRole('link', { name: copy.source(1, 'Pune to Lonavala') })).toBeTruthy();
  expect(screen.getByText(copy.live)).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: copy.good }));
  expect(screen.getByText(copy.ratedGood)).toBeTruthy();
  expect(rate).toHaveBeenCalledWith(
    'http://10.0.2.2:8000/v1/memory/9/rate',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ rating: 'good' }) }),
  );
});

test('Stop keeps the partial answer as cancelled', async () => {
  fetchMock.mockImplementationOnce(async (_url: string, init: { signal: AbortSignal }) =>
    stream([text('Half of '), text('never sent')], { at: 1, signal: init.signal }),
  );
  await render(<Chat />);
  await ask('Tell me a long story');

  expect(await screen.findByText('Half of', { exact: false }, wait)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: copy.stop }));

  expect(await screen.findByText(copy.stopped, {}, wait)).toBeTruthy();
  const [chat] = Object.values(useChatStore.getState().chats);
  expect(chat.messages[1]).toMatchObject({ content: 'Half of ', finish_reason: 'cancelled' });
});

test('Continue extends an answer cut at its limit', async () => {
  fetchMock
    .mockResolvedValueOnce(stream([text('First part,'), done('length')]))
    .mockResolvedValueOnce(stream([text(' second part.'), done('stop')]));
  await render(<Chat />);
  await ask('Explain it all');

  await fireEvent.press(await screen.findByRole('button', { name: copy.continue }, wait));

  expect(await screen.findByText('First part, second part.', {}, wait)).toBeTruthy();
  const messages = lastBody().messages;
  expect(messages.at(-1)).toEqual({ role: 'assistant', content: 'First part,' });
  expect(screen.queryByRole('button', { name: copy.continue })).toBeNull();
});

test('an error keeps what arrived and says what happened', async () => {
  fetchMock.mockResolvedValueOnce(
    stream([text('Partial'), sse({ error: { message: 'out of GPU memory' } })]),
  );
  await render(<Chat />);
  await ask('Q');
  expect(await screen.findByText('out of GPU memory', {}, wait)).toBeTruthy();
  expect(screen.getByText('Partial')).toBeTruthy();
});

test('away from home the composer says why and nothing is sent', async () => {
  useHomeModeStore.setState({ mode: { kind: 'away', distanceM: 5000 } });
  await render(<Chat />);
  expect(screen.getByLabelText(copy.unavailable.away)).toBeTruthy();
  expect(screen.queryByLabelText(copy.placeholder)).toBeNull();
});

test('a private chat sends memory: false and keeps nothing', async () => {
  mockParams = { id: 'private' };
  fetchMock.mockResolvedValueOnce(stream([text('Sure.'), done('stop')]));
  await render(<Chat />);
  expect(screen.getByText(copy.privateBanner)).toBeTruthy();

  await ask('Something private');
  expect(await screen.findByText('Sure.', {}, wait)).toBeTruthy();
  expect(lastBody()).toMatchObject({ memory: false, web: 'auto' });
  expect(useChatStore.getState().chats).toEqual({});
});

test('a 3.1 suggestion is sent as soon as the chat opens', async () => {
  mockParams = { id: 'new', q: 'Plan tomorrow morning' };
  fetchMock.mockResolvedValueOnce(stream([text('Here is a plan.'), done('stop')]));
  await render(<Chat />);
  expect(await screen.findByText('Here is a plan.', {}, wait)).toBeTruthy();
  expect(lastBody().messages.at(-1)).toEqual({ role: 'user', content: 'Plan tomorrow morning' });
});

test('Guest: memory and web off, nothing kept, End locks and goes back', async () => {
  await openGuestSession();
  fetchMock.mockResolvedValueOnce(stream([text('Hello guest.'), done('stop')]));
  await render(<Guest />);
  expect(screen.getByText(guestCopy.callout)).toBeTruthy();
  // Guest never gets the web switch.
  expect(screen.queryByRole('switch')).toBeNull();

  await fireEvent.changeText(screen.getByLabelText(guestCopy.placeholder), 'Hi');
  await fireEvent.press(screen.getByRole('button', { name: copy.send }));
  expect(await screen.findByText('Hello guest.', {}, wait)).toBeTruthy();
  expect(lastBody()).toMatchObject({ memory: false, web: false });
  expect(useChatStore.getState().chats).toEqual({});

  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: guestCopy.end }));
  });
  expect(useFirstRunStore.getState().session).toBeNull();
  expect(mockBack).toHaveBeenCalled();
});

test('Use my area: the city rides in the system message and the question is flagged', async () => {
  const line = jest.spyOn(area, 'areaLine').mockReturnValue('The user is in or near Pune.');
  fetchMock.mockResolvedValueOnce(stream([text('Try the cafe on FC Road.'), done('stop')]));
  await render(<Chat />);
  await ask('Good cafes near me?');

  await waitFor(() => expect(fetchMock).toHaveBeenCalled(), wait);
  expect(lastBody().messages[0]).toEqual({
    role: 'system',
    content: 'The user is in or near Pune.',
  });
  expect(JSON.stringify(lastBody())).not.toMatch(/18\.5|73\.8/);
  const [chat] = Object.values(useChatStore.getState().chats);
  await waitFor(
    () =>
      expect(
        chat.messages[0]?.context ??
          useChatStore.getState().chats[chat.clientUuid].messages[0].context,
      ).toEqual(['area']),
    wait,
  );
  line.mockRestore();
});
