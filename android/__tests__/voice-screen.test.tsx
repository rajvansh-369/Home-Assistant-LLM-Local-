// Voice V2 (docs/aster-voice-plan.md §3, §4): 3.6 listens, asks zypherLL for a short answer,
// speaks it sentence by sentence and listens once more; the turn is a saved chat with the `voice`
// flag. 3.1's mic and 3.4's "Talk instead" open it. Native speech is the module's Jest mock; the
// stream is a fake expo/fetch.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { router } from 'expo-router';
import { PermissionsAndroid } from 'react-native';

import AsterSystem from '../modules/aster-system';

import Home from '@/app/(tabs)/home';
import Chat from '@/app/chat/[id]';
import Voice from '@/app/voice';
import { installChatSession } from '@/features/chat/actions';
import { chat as chatCopy } from '@/features/chat/copy';
import { SPOKEN_LINE } from '@/features/chat/prompt';
import { flushQueue, resetQueueRunner } from '@/features/chat/queue';
import { useChatStore } from '@/features/chat/store';
import { resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { useHomeModeStore } from '@/features/home-mode/store';
import { voice as copy } from '@/features/voice/copy';
import { mockApi, setMockLatency } from '@/services/api/mock';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/features/home-mode/controller', () => ({ checkHomeMode: jest.fn(async () => {}) }));
jest.mock('@/services/geofence', () => ({ isHomeGeofenceRunning: jest.fn(async () => true) }));

let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
  },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: jest.fn(),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

type MockSystem = typeof AsterSystem & {
  __state: {
    listens: { session: number }[];
    queued: { text: string; id: string }[];
    speech: { available: boolean; onDevice: boolean };
  };
  __reset(): void;
  __emit(event: string, payload?: unknown): void;
  __session(): number;
};
const system = AsterSystem as MockSystem;

const fetchMock = jest.mocked(expoFetch) as unknown as jest.Mock;
const encoder = new TextEncoder();
const wait = { timeout: 3000 };

const sse = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
const text = (content: string) =>
  sse({ choices: [{ index: 0, delta: { content }, finish_reason: null }] });
const done = (finish: string) =>
  sse({ choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: null, zypher: {} }) +
  'data: [DONE]\n\n';

function stream(parts: string[]) {
  let i = 0;
  return {
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      getReader: () => ({
        read: async () =>
          i >= parts.length ? { done: true } : { done: false, value: encoder.encode(parts[i++]) },
      }),
    },
  };
}

const lastBody = () => JSON.parse(fetchMock.mock.calls.at(-1)[1].body);
const session = () => system.__session();

/** The recognizer hears `words` on the newest listen. */
async function hear(words: string) {
  await act(async () => {
    system.__emit('onSpeechPartial', { session: session(), text: words.slice(0, 5) });
    system.__emit('onSpeechResult', { session: session(), text: words });
  });
}

/** Every queued sentence has been said. */
async function finishSpeaking() {
  await act(async () => {
    system.__state.queued.forEach(({ id }) => system.__emit('onSpeakDone', { id, spoken: true }));
  });
}

beforeAll(() => {
  setMockLatency(0, 0);
  installChatSession();
});

beforeEach(async () => {
  system.__reset();
  fetchMock.mockReset();
  jest.mocked(router.push).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(router.back).mockClear();
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
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
  mockParams = {};
});

test('3.6 listens, speaks the streamed answer sentence by sentence, saves it, then listens again', async () => {
  fetchMock.mockResolvedValueOnce(
    stream([text('It is 31 degrees. '), text('Carry water'), text(' today.'), done('stop')]),
  );
  await render(<Voice />);

  expect(await screen.findByText(copy.listening, {}, wait)).toBeTruthy();
  expect(system.__state.listens).toHaveLength(1);
  expect(screen.getByRole('button', { name: copy.pauseListening })).toBeTruthy();

  await hear('How hot is it today?');

  expect(await screen.findByText('It is 31 degrees. Carry water today.', {}, wait)).toBeTruthy();
  expect(screen.getByText('“How hot is it today?”')).toBeTruthy();
  await waitFor(
    () =>
      expect(system.__state.queued.map((q) => q.text)).toEqual([
        'It is 31 degrees.',
        'Carry water today.',
      ]),
    wait,
  );
  expect(screen.getByText(copy.speaking)).toBeTruthy();

  // A short, spoken answer: the system line and max_tokens 200.
  const body = lastBody();
  expect(body.max_tokens).toBe(200);
  expect(body.messages[0]).toMatchObject({ role: 'system' });
  expect(body.messages[0].content).toContain(SPOKEN_LINE);
  expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'How hot is it today?' });

  // Spoken: listening resumes once for a follow-up.
  await finishSpeaking();
  await waitFor(() => expect(system.__state.listens).toHaveLength(2), wait);
  expect(await screen.findByText(copy.listening, {}, wait)).toBeTruthy();

  // Nobody answers the follow-up: Paused, with no message.
  await act(async () => {
    system.__emit('onSpeechError', { session: session(), kind: 'no-speech' });
  });
  expect(await screen.findByText(copy.paused, {}, wait)).toBeTruthy();
  expect(screen.queryByText(copy.noSpeech)).toBeNull();

  // The turn is an ordinary chat, uploaded with the voice flag.
  const [chat] = Object.values(useChatStore.getState().chats);
  expect(chat.title).toBe('How hot is it today?');
  expect(chat.messages[0].context).toContain('voice');
  await flushQueue();
  await waitFor(() => expect(useChatStore.getState().queue).toEqual([]), wait);
  const token = useFirstRunStore.getState().session!.profileToken;
  const stored = await mockApi.listMessages(
    'https://aster.test',
    token,
    useChatStore.getState().chats[chat.clientUuid].serverId!,
  );
  expect(stored.data.map((m) => m.content)).toEqual([
    'How hot is it today?',
    'It is 31 degrees. Carry water today.',
  ]);
  expect(stored.data[0].context).toContain('voice');
});

test('Mute stops the speech and keeps the text; the mic pauses listening', async () => {
  fetchMock.mockResolvedValueOnce(
    stream([text('First part. '), text('Second part.'), done('stop')]),
  );
  await render(<Voice />);
  await screen.findByText(copy.listening, {}, wait);

  // The mic while listening pauses.
  await fireEvent.press(screen.getByRole('button', { name: copy.pauseListening }));
  expect(AsterSystem.cancelListening).toHaveBeenCalled();
  expect(await screen.findByText(copy.paused, {}, wait)).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: copy.startListening }));
  await waitFor(() => expect(system.__state.listens).toHaveLength(2), wait);
  await fireEvent.press(screen.getByRole('button', { name: copy.mute }));
  expect(screen.getByRole('button', { name: copy.unmute })).toBeTruthy();

  await hear('Tell me something');
  expect(await screen.findByText('First part. Second part.', {}, wait)).toBeTruthy();
  expect(system.__state.queued).toEqual([]);
  // Nothing to say, so the follow-up listen starts at once.
  await waitFor(() => expect(system.__state.listens).toHaveLength(3), wait);
});

test('no speech says so; a refused microphone points to settings', async () => {
  await render(<Voice />);
  await screen.findByText(copy.listening, {}, wait);
  await act(async () => {
    system.__emit('onSpeechError', { session: session(), kind: 'no-speech' });
  });
  expect(await screen.findByText(copy.noSpeech, {}, wait)).toBeTruthy();
  expect(screen.getByText(copy.paused)).toBeTruthy();

  await fireEvent.press(screen.getByRole('button', { name: copy.startListening }));
  await waitFor(() => expect(system.__state.listens).toHaveLength(2), wait);
  await act(async () => {
    system.__emit('onSpeechError', { session: session(), kind: 'permission' });
  });
  expect(await screen.findByText(copy.micBlocked, {}, wait)).toBeTruthy();
  expect(screen.getByRole('button', { name: copy.openSettings })).toBeTruthy();
});

test('away from home 3.6 says voice works at home and never listens', async () => {
  useHomeModeStore.setState({ mode: { kind: 'away', distanceM: 1200, me: null } });
  await render(<Voice />);
  expect(await screen.findByText(copy.notHome, {}, wait)).toBeTruthy();
  expect(system.__state.listens).toHaveLength(0);
  const mic = screen.getByRole('button', { name: copy.startListening });
  expect(mic.props.accessibilityState).toMatchObject({ disabled: true });
});

test('leaving home mid-listen pauses and cancels the recognizer', async () => {
  await render(<Voice />);
  await screen.findByText(copy.listening, {}, wait);
  await act(async () => {
    useHomeModeStore.setState({ mode: { kind: 'checking' } });
  });
  expect(await screen.findByText(copy.notHome, {}, wait)).toBeTruthy();
  expect(AsterSystem.cancelListening).toHaveBeenCalled();
});

test('Switch to typing opens 3.4 with the voice chat; Close goes back', async () => {
  fetchMock.mockResolvedValueOnce(stream([text('Sure.'), done('stop')]));
  await render(<Voice />);
  await screen.findByText(copy.listening, {}, wait);
  await hear('Plan my evening');
  await screen.findByText('Sure.', {}, wait);
  const [chat] = Object.values(useChatStore.getState().chats);

  await fireEvent.press(screen.getByRole('button', { name: copy.switchToTyping }));
  expect(router.replace).toHaveBeenCalledWith({
    pathname: '/chat/[id]',
    params: { id: chat.clientUuid },
  });

  await fireEvent.press(screen.getByRole('button', { name: copy.close }));
  expect(router.back).toHaveBeenCalled();
});

test('3.6 is closed to a profile without Voice and wake word', async () => {
  const current = useFirstRunStore.getState().session!;
  useFirstRunStore.getState().set({
    session: { ...current, profile: { ...current.profile, voice_enabled: false } },
  });
  await render(<Voice />);
  expect(screen.getByText('redirect:/home')).toBeTruthy();
  expect(system.__state.listens).toHaveLength(0);
});

test('3.1 shows Talk to Aster at home when voice is on, and opens 3.6', async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole('button', { name: copy.talkToAster }));
  expect(router.push).toHaveBeenLastCalledWith('/voice');

  const current = useFirstRunStore.getState().session!;
  await act(async () => {
    useFirstRunStore.getState().set({
      session: { ...current, profile: { ...current.profile, voice_enabled: false } },
    });
  });
  expect(screen.queryByRole('button', { name: copy.talkToAster })).toBeNull();
});

test('3.4 Talk instead opens 3.6 continuing the chat; private chats have no mic', async () => {
  fetchMock.mockResolvedValueOnce(stream([text('Hello.'), done('stop')]));
  mockParams = { id: 'new' };
  const view = await render(<Chat />);
  await fireEvent.press(screen.getByRole('button', { name: copy.talkInstead }));
  expect(router.push).toHaveBeenLastCalledWith('/voice');

  await fireEvent.changeText(screen.getByLabelText(chatCopy.placeholder), 'Hi');
  await fireEvent.press(screen.getByRole('button', { name: chatCopy.send }));
  await screen.findByText('Hello.', {}, wait);
  const [chat] = Object.values(useChatStore.getState().chats);
  await fireEvent.press(screen.getByRole('button', { name: copy.talkInstead }));
  expect(router.push).toHaveBeenLastCalledWith({
    pathname: '/voice',
    params: { chat: chat.clientUuid },
  });
  await view.unmount();

  mockParams = { id: 'private' };
  await render(<Chat />);
  expect(screen.queryByRole('button', { name: copy.talkInstead })).toBeNull();
});
