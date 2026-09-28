// AI help and the home cards (docs/aster-messages-alerts-plan.md §3, §6, M4): the catch-up and reply
// prompts (local engine, web and memory off, precise, no one-time codes), reading the model's JSON,
// the 4.1 / 4.2 cards, and 3.1 / 3.2 for the Owner. zypherLL is replaced by a fake askZypher.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AsterSystem, { type CapturedMessage, type CapturedThread } from '../modules/aster-system';

import { askZypher, type AskInput } from '@/features/chat/ask';
import { buildMessages } from '@/features/chat/prompt';
import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { useHomeModeStore } from '@/features/home-mode/store';
import { refreshAlerts, resetAlertsRuntime } from '@/features/messages/alerts';
import {
  catchUpPrompt,
  readOutText,
  resetCatchUpCache,
  unreadMessages,
} from '@/features/messages/catchup';
import { CatchUpCard } from '@/features/messages/CatchUpCard';
import {
  home as homeCopy,
  messages as listCopy,
  thread as threadCopy,
} from '@/features/messages/copy';
import { draftPrompt, parseSuggestion, resetDraftCache } from '@/features/messages/drafts';
import { AwayVipCard, ListeningChip, MissedCard } from '@/features/messages/HomeCards';
import { ReplyAssist } from '@/features/messages/ReplyAssist';
import { refreshThreads, resetThreadsRuntime } from '@/features/messages/threads';
import { lockSession } from '@/features/profiles/actions';
import { mockApi, setMockLatency } from '@/services/api/mock';

jest.mock('@/features/chat/ask', () => ({ askZypher: jest.fn(), activeEngine: () => 'local' }));
const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    navigate: (...args: unknown[]) => mockNavigate(...args),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  },
  useFocusEffect: jest.fn(),
}));

type MockSystem = typeof AsterSystem & {
  __state: {
    threads: CapturedThread[];
    messages: Record<string, CapturedMessage[]>;
    spoken: string[];
  };
  __reset(): void;
};
const system = AsterSystem as MockSystem;
const ask = jest.mocked(askZypher);
const server = 'https://aster.test';
const AT = Date.parse('2026-09-28T14:12:00Z');

function message(
  id: number,
  key: string,
  overrides: Partial<CapturedMessage> = {},
): CapturedMessage {
  return {
    id,
    threadKey: key,
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

const ASHA = 'whatsapp-aaaaaaaaaaaaaaaaaaaa';
const BANK = 'sms-bbbbbbbbbbbbbbbbbbbb';
const ashaMessages = [message(1, ASHA, { text: 'Call me when you’re free' }), message(2, ASHA)];
const bankMessages = [
  message(3, BANK, { source: 'sms', sender: 'BANK-ALERT', text: 'Your OTP is 482913', otp: true }),
];
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
const bank: CapturedThread = {
  ...asha,
  key: BANK,
  source: 'sms',
  title: 'BANK-ALERT',
  count: 1,
  unreadSenders: ['BANK-ALERT'],
  last: bankMessages[0],
};

/** askZypher answers with `text`, streaming it in one piece. */
function answer(text: string) {
  ask.mockImplementationOnce(async (input: AskInput) => {
    input.onEvent({ type: 'text', text });
    return { text, finishReason: 'stop', usage: null, meta: {}, seconds: 1 };
  });
}

async function addAshaAsVip() {
  const { session } = useFirstRunStore.getState();
  await mockApi.createVipContact(server, session!.profileToken, {
    name: 'Asha',
    match_key: 'Asha Kulkarni',
    sources: ['whatsapp'],
    enabled: true,
  });
  await refreshAlerts();
}

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  ask.mockReset();
  mockPush.mockClear();
  mockNavigate.mockClear();
  system.__reset();
  resetThreadsRuntime();
  resetAlertsRuntime();
  resetCatchUpCache();
  resetDraftCache();
  await resetFirstRun();
  await AsyncStorage.clear();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
  await unlockOwner('123456');
  finishFirstRun([]);
  useHomeModeStore.setState({ mode: { kind: 'ready', busy: false } });
  system.__state.threads = [asha, bank];
  system.__state.messages = { [ASHA]: ashaMessages, [BANK]: bankMessages };
  jest.mocked(AsterSystem.isNotificationListenerEnabled).mockReturnValue(true);
  await refreshThreads();
});

describe('prompts', () => {
  test('the catch-up leaves one-time codes out', async () => {
    const items = await unreadMessages([asha, bank]);
    expect(items.map((i) => i.message.id)).toEqual([1, 2]);
    const prompt = catchUpPrompt(items);
    expect(prompt[0].content).toContain('Test Owner');
    expect(prompt[1].content).toContain('WhatsApp chat "Asha Kulkarni"');
    expect(JSON.stringify(prompt)).not.toContain('482913');
  });

  test('Read aloud uses the spoken Full wording, with the VIP’s name', async () => {
    await addAshaAsVip();
    const items = await unreadMessages([asha]);
    expect(
      readOutText(items, [
        { id: 1, name: 'Asha', match_key: 'Asha Kulkarni', sources: ['whatsapp'], enabled: true },
      ]),
    ).toBe('Asha sent 2 WhatsApp messages. Call me when you’re free. Are you coming on Sunday?');
  });

  test('the reply draft sends the chat without codes; its JSON is read loosely', () => {
    const prompt = draftPrompt(bank, [
      ...bankMessages,
      message(4, BANK, { source: 'sms', sender: 'BANK-ALERT', text: 'Balance updated' }),
    ]);
    expect(prompt[1].content).toBe('BANK-ALERT: Balance updated');
    expect(
      parseSuggestion(
        'Sure! {"summary": "She wants a call.", "draft": "I’ll call at 9.", "replies": [{"label": "Call at 9", "text": "I’ll call you at 9."}, "Can’t today"]}',
      ),
    ).toEqual({
      summary: 'She wants a call.',
      draft: 'I’ll call at 9.',
      replies: [
        { label: 'Call at 9', text: 'I’ll call you at 9.' },
        { label: 'Can’t today', text: 'Can’t today' },
      ],
    });
    expect(parseSuggestion('I cannot help with that.')).toBeNull();
    expect(parseSuggestion('{"summary": "x"}')).toBeNull();
  });

  test('"Ask about it" adds the messages as a system message', () => {
    const built = buildMessages({ context: 'Unread: …', history: [], question: 'Who wrote?' });
    expect(built[0]).toEqual({ role: 'system', content: 'Unread: …' });
  });
});

describe('4.1 Catch-up', () => {
  test('at home it asks the local model once, with web and memory off', async () => {
    answer('Asha is waiting on you about Sunday.');
    await render(<CatchUpCard threads={[asha, bank]} />);
    expect(await screen.findByText('Asha is waiting on you about Sunday.')).toBeTruthy();
    expect(screen.getByText('3 unread · 2 chats')).toBeTruthy();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0][0]).toMatchObject({
      engine: 'local',
      web: false,
      memory: false,
      sampling: 'precise',
    });
    await fireEvent.press(screen.getByLabelText(listCopy.catchUp.readAloud));
    expect(system.__state.spoken).toEqual(['Asha is waiting on you about Sunday.']);
  });

  test('away there is no summary; Read aloud reads the messages', async () => {
    useHomeModeStore.setState({ mode: { kind: 'away', distanceM: null } });
    await render(<CatchUpCard threads={[asha, bank]} />);
    expect(await screen.findByText(listCopy.catchUp.needsHome)).toBeTruthy();
    expect(ask).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText(listCopy.catchUp.readAloud));
    expect(system.__state.spoken[0]).toMatch(/^Asha Kulkarni sent 2 WhatsApp messages\./);
  });

  test('Ask about it opens a private chat about the messages', async () => {
    answer('Summary.');
    await render(<CatchUpCard threads={[asha]} />);
    await fireEvent.press(screen.getByLabelText(listCopy.catchUp.askAbout));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/chat/[id]',
      params: { id: 'private', about: 'messages' },
    });
  });
});

describe('4.2 suggested reply', () => {
  test('fills the draft, offers the replies and rewrites', async () => {
    answer(
      '{"summary": "She wants to know about Sunday.", "draft": "Yes, see you Sunday!", "replies": [{"label": "Yes", "text": "Yes, I’ll come."}, {"label": "No", "text": "Sorry, I can’t."}, {"label": "Later", "text": "I’ll tell you tonight."}]}',
    );
    const onDraft = jest.fn();
    const view = await render(
      <ReplyAssist thread={asha} messages={ashaMessages} draft="" onDraft={onDraft} />,
    );
    expect(await screen.findByText('She wants to know about Sunday.')).toBeTruthy();
    expect(onDraft).toHaveBeenLastCalledWith('Yes, see you Sunday!');
    await fireEvent.press(screen.getByLabelText('No'));
    expect(onDraft).toHaveBeenLastCalledWith('Sorry, I can’t.');

    await view.rerender(
      <ReplyAssist
        thread={asha}
        messages={ashaMessages}
        draft="Sorry, I can’t."
        onDraft={onDraft}
      />,
    );
    answer('“Maaf karna, nahi aa paunga.”');
    await fireEvent.press(screen.getByLabelText('Hinglish'));
    expect(onDraft).toHaveBeenLastCalledWith('Maaf karna, nahi aa paunga.');
    expect(ask.mock.calls[1][0].messages[0].content).toContain('Hinglish');
  });

  test('an unusable answer offers Try again', async () => {
    answer('I am not sure.');
    await render(
      <ReplyAssist thread={asha} messages={ashaMessages} draft="" onDraft={jest.fn()} />,
    );
    expect(await screen.findByText(threadCopy.draftFailed)).toBeTruthy();
    answer('{"draft": "Coming!"}');
    await fireEvent.press(screen.getByText(threadCopy.tryAgain));
    expect(await screen.findByText(threadCopy.suggested)).toBeTruthy();
    expect(screen.queryByText(threadCopy.draftFailed)).toBeNull();
  });

  test('away: no suggestions', async () => {
    useHomeModeStore.setState({ mode: { kind: 'away', distanceM: null } });
    await render(
      <ReplyAssist thread={asha} messages={ashaMessages} draft="" onDraft={jest.fn()} />,
    );
    expect(screen.getByText(threadCopy.needsHome)).toBeTruthy();
    expect(ask).not.toHaveBeenCalled();
  });
});

describe('3.1 / 3.2 for the Owner', () => {
  test('the missed card lists VIP chats; Summarize opens 4.1', async () => {
    await addAshaAsVip();
    await render(<MissedCard />);
    expect(screen.getByText(homeCopy.missedTitle)).toBeTruthy();
    expect(screen.getByText('“Are you coming on Sunday?”')).toBeTruthy();
    expect(screen.queryByText('BANK-ALERT')).toBeNull();
    await fireEvent.press(screen.getByLabelText(homeCopy.summarize));
    expect(mockNavigate).toHaveBeenCalledWith('/messages');
  });

  test('the listening chip and the away card count VIPs', async () => {
    await addAshaAsVip();
    await render(
      <>
        <ListeningChip />
        <AwayVipCard />
      </>,
    );
    expect(screen.getByText(homeCopy.listening(1))).toBeTruthy();
    expect(screen.getByText(homeCopy.awayTitle(2))).toBeTruthy();
  });

  test('nothing without VIPs, and nothing for other profiles', async () => {
    await render(<MissedCard />);
    expect(screen.queryByText(homeCopy.missedTitle)).toBeNull();
    await addAshaAsVip();
    lockSession();
    await render(<MissedCard />);
    expect(screen.queryByText(homeCopy.missedTitle)).toBeNull();
  });
});
