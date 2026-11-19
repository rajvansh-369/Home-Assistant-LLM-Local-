// Voice V3 (docs/aster-voice-plan.md §5, §3 4.4): on 3.6, reminders are made by voice, missed
// messages read out and replied to after confirming, and the missed-message notification's Reply
// by voice opens 3.6 for one chat. None of it goes to the chat or zypherLL (fetch is never called
// for ≤3 messages); native speech and messages are the module's Jest mock.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { fetch as expoFetch } from 'expo/fetch';
import { router } from 'expo-router';
import { PermissionsAndroid } from 'react-native';

import AsterSystem, { type CapturedMessage, type CapturedThread } from '../modules/aster-system';

import Voice from '@/app/voice';
import { installChatSession } from '@/features/chat/actions';
import { resetQueueRunner } from '@/features/chat/queue';
import { useChatStore } from '@/features/chat/store';
import { resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { useHomeModeStore } from '@/features/home-mode/store';
import { resetThreadsRuntime } from '@/features/messages/threads';
import { reminders as reminderCopy } from '@/features/reminders/copy';
import { clearReminders, resetRemindersRuntime, useRemindersStore } from '@/features/reminders/store';
import { voice as copy } from '@/features/voice/copy';
import { setMockLatency } from '@/services/api/mock';

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
    threads: CapturedThread[];
    messages: Record<string, CapturedMessage[]>;
    seen: string[];
    replies: { key: string; text: string }[];
    replyResult: string;
  };
  __reset(): void;
  __emit(event: string, payload?: unknown): void;
  __session(): number;
};
const system = AsterSystem as MockSystem;
const fetchMock = jest.mocked(expoFetch) as unknown as jest.Mock;
const wait = { timeout: 3000 };

const AT = Date.parse('2026-11-19T09:00:00Z');
const ASHA = 'whatsapp-aaaaaaaaaaaaaaaaaaaa';

function message(id: number, overrides: Partial<CapturedMessage> = {}): CapturedMessage {
  return {
    id,
    threadKey: ASHA,
    source: 'whatsapp',
    sender: 'Asha Kulkarni',
    text: 'Are you coming on Sunday?',
    at: AT + id * 60_000,
    outgoing: false,
    otp: false,
    read: false,
    spokenAt: null,
    ...overrides,
  };
}

const ashaMessages = [message(1, { text: 'Call me when you’re free' }), message(2)];
const asha: CapturedThread = {
  key: ASHA,
  source: 'whatsapp',
  title: 'Asha Kulkarni',
  isGroup: false,
  count: 2,
  unreadSenders: ['Asha Kulkarni', 'Asha Kulkarni'],
  spokenAt: null,
  canReply: true,
  last: ashaMessages[1],
};

const session = () => system.__session();
const spoken = () => system.__state.queued.map((q) => q.text).join(' ');

async function hear(words: string) {
  await act(async () => {
    system.__emit('onSpeechResult', { session: session(), text: words });
  });
}

async function finishSpeaking() {
  await act(async () => {
    system.__state.queued.forEach(({ id }) => system.__emit('onSpeakDone', { id, spoken: true }));
  });
}

function setRole(role: 'owner' | 'member' | 'restricted') {
  const current = useFirstRunStore.getState().session!;
  useFirstRunStore.getState().set({ session: { ...current, profile: { ...current.profile, role } } });
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
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  resetQueueRunner();
  resetRemindersRuntime();
  await clearReminders();
  resetThreadsRuntime();
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
  system.__state.threads = [asha];
  system.__state.messages = { [ASHA]: ashaMessages };
  mockParams = {};
});

test('"Remind me … when I get home" saves an arrive-home reminder with a card and Edit', async () => {
  await render(<Voice />);
  await screen.findByText(copy.listening, {}, wait);
  await hear('Remind me to water the plants when I get home');

  const said = copy.reminderSaved(copy.remindHome);
  expect(await screen.findByText(said, {}, wait)).toBeTruthy();
  const card = screen.getByLabelText(copy.reminderCard('Water the plants', reminderCopy.whenHome));
  expect(card).toBeTruthy();
  const [reminder] = Object.values(useRemindersStore.getState().reminders);
  expect(reminder).toMatchObject({ title: 'Water the plants', trigger: 'arrive_home' });
  await waitFor(() => expect(spoken()).toContain('Done.'), wait);

  // Not a chat turn: nothing was asked of zypherLL and no chat was saved.
  expect(fetchMock).not.toHaveBeenCalled();
  expect(Object.values(useChatStore.getState().chats)).toHaveLength(0);

  await fireEvent.press(screen.getByRole('button', { name: copy.edit }));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/reminder/[id]',
    params: { id: reminder.clientUuid },
  });

  // Spoken: listening resumes for a follow-up.
  await finishSpeaking();
  await waitFor(() => expect(system.__state.listens).toHaveLength(2), wait);
});

test('a timed reminder rings at the time said; no time asks when; Restricted is told no', async () => {
  await render(<Voice />);
  await screen.findByText(copy.listening, {}, wait);
  const before = Date.now();
  await hear('Remind me to check the oven in 10 minutes');
  await waitFor(() => expect(Object.values(useRemindersStore.getState().reminders)).toHaveLength(1), wait);
  const [reminder] = Object.values(useRemindersStore.getState().reminders);
  expect(reminder.trigger).toBe('time');
  const due = Date.parse(reminder.dueAt!);
  expect(due - before).toBeGreaterThanOrEqual(10 * 60_000 - 1000);
  expect(due - before).toBeLessThan(11 * 60_000);

  await finishSpeaking();
  await waitFor(() => expect(system.__state.listens).toHaveLength(2), wait);
  await hear('Remind me to call the plumber');
  expect(await screen.findByText(copy.reminderWhen, {}, wait)).toBeTruthy();
  expect(Object.values(useRemindersStore.getState().reminders)).toHaveLength(1);

  await act(async () => setRole('restricted'));
  await finishSpeaking();
  await waitFor(() => expect(system.__state.listens).toHaveLength(3), wait);
  await hear('Remind me to call the plumber at 5 pm');
  expect(await screen.findByText(copy.remindersOff, {}, wait)).toBeTruthy();
  expect(Object.values(useRemindersStore.getState().reminders)).toHaveLength(1);
});

test('missed messages are read out for the Owner, then a reply is sent only after "Send"', async () => {
  await render(<Voice />);
  await screen.findByText(copy.listening, {}, wait);
  await hear('Read my missed messages from Asha');

  expect(await screen.findByText(/Asha Kulkarni sent 2 WhatsApp messages\./, {}, wait)).toBeTruthy();
  await waitFor(() => expect(spoken()).toContain('Call me when you’re free.'), wait);
  expect(system.__state.seen).toEqual([ASHA]);
  expect(fetchMock).not.toHaveBeenCalled();

  await finishSpeaking();
  await waitFor(() => expect(system.__state.listens).toHaveLength(2), wait);
  await hear("Say I'll call at 9");
  expect(
    await screen.findByText(copy.confirmReply("I'll call at 9", 'Asha Kulkarni'), {}, wait),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: copy.send })).toBeTruthy();
  expect(system.__state.replies).toEqual([]);

  await finishSpeaking();
  await waitFor(() => expect(system.__state.listens).toHaveLength(3), wait);
  await hear('Send');
  expect(await screen.findByText(copy.replySent('Asha Kulkarni'), {}, wait)).toBeTruthy();
  expect(system.__state.replies).toEqual([{ key: ASHA, text: "I'll call at 9" }]);
  expect(Object.values(useChatStore.getState().chats)).toHaveLength(0);
});

test('"Not now" drops the reply and pauses', async () => {
  await render(<Voice />);
  await screen.findByText(copy.listening, {}, wait);
  await hear('What did Asha say');
  await screen.findByText(/Asha Kulkarni sent 2/, {}, wait);
  await finishSpeaking();
  await waitFor(() => expect(system.__state.listens).toHaveLength(2), wait);
  await hear('Reply on my way');
  await screen.findByText(copy.confirmReply('On my way', 'Asha Kulkarni'), {}, wait);

  await fireEvent.press(screen.getByRole('button', { name: copy.notNow }));
  expect(await screen.findByText(copy.replyNotSent, {}, wait)).toBeTruthy();
  expect(system.__state.replies).toEqual([]);
  await finishSpeaking();
  expect(await screen.findByText(copy.paused, {}, wait)).toBeTruthy();
  expect(system.__state.listens).toHaveLength(2);
});

test('nothing missed says so; other profiles are told messages are the Owner’s', async () => {
  system.__state.threads = [];
  await render(<Voice />);
  await screen.findByText(copy.listening, {}, wait);
  await hear('Read my messages');
  expect(await screen.findByText(copy.noMessages, {}, wait)).toBeTruthy();

  await act(async () => setRole('member'));
  await finishSpeaking();
  await waitFor(() => expect(system.__state.listens).toHaveLength(2), wait);
  await hear('Read my messages');
  expect(await screen.findByText(copy.messagesOwnerOnly, {}, wait)).toBeTruthy();
});

test('Reply by voice reads the chat out, then sends the reply after tapping Send', async () => {
  mockParams = { thread: ASHA };
  await render(<Voice />);
  expect(await screen.findByText(/Asha Kulkarni sent 2 WhatsApp messages\./, {}, wait)).toBeTruthy();
  expect(system.__state.seen).toEqual([ASHA]);

  await finishSpeaking();
  await waitFor(() => expect(system.__state.listens).toHaveLength(1), wait);
  await hear('Reply On my way!');
  await screen.findByText(copy.confirmReply('On my way!', 'Asha Kulkarni'), {}, wait);
  await fireEvent.press(screen.getByRole('button', { name: copy.send }));
  expect(await screen.findByText(copy.replySent('Asha Kulkarni'), {}, wait)).toBeTruthy();
  expect(system.__state.replies).toEqual([{ key: ASHA, text: 'On my way!' }]);
});

test('Reply by voice: a gone notification is said', async () => {
  system.__state.replyResult = 'no-action';
  mockParams = { thread: ASHA };
  await render(<Voice />);
  await screen.findByText(/Asha Kulkarni sent 2/, {}, wait);
  await finishSpeaking();
  await waitFor(() => expect(system.__state.listens).toHaveLength(1), wait);
  await hear('Say coming');
  await screen.findByText(copy.confirmReply('Coming', 'Asha Kulkarni'), {}, wait);
  await finishSpeaking();
  await waitFor(() => expect(system.__state.listens).toHaveLength(2), wait);
  await hear('yes');
  expect(await screen.findByText(copy.replyGone('WhatsApp'), {}, wait)).toBeTruthy();
  expect(system.__state.replies).toEqual([]);
});

test('Reply by voice away from home offers the chat in 4.2', async () => {
  mockParams = { thread: ASHA };
  useHomeModeStore.setState({ mode: { kind: 'away', distanceM: 1200, me: null } });
  await render(<Voice />);
  expect(await screen.findByText(copy.notHome, {}, wait)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: copy.openChat }));
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/thread/[key]', params: { key: ASHA } });
});

test('Reply by voice for a profile without voice goes to 4.2 instead', async () => {
  const current = useFirstRunStore.getState().session!;
  useFirstRunStore.getState().set({
    session: { ...current, profile: { ...current.profile, voice_enabled: false } },
  });
  mockParams = { thread: ASHA };
  await render(<Voice />);
  expect(screen.getByText(`redirect:/thread/${ASHA}`)).toBeTruthy();
  expect(system.__state.listens).toHaveLength(0);
});
