// 4.1 Messages and 4.2 Thread (docs/aster-messages-alerts-plan.md §3, M3). Threads and messages come
// from the Jest mock of the native module; VIP contacts from the mock server.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AsterSystem, { type CapturedMessage, type CapturedThread } from '../modules/aster-system';

import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { readDeviceUploads, resetDeviceUploadsRuntime } from '@/features/location/uploads';
import { refreshAlerts, resetAlertsRuntime, useAlertsStore } from '@/features/messages/alerts';
import { messages as listCopy, thread as copy } from '@/features/messages/copy';
import { MessagesScreen } from '@/features/messages/MessagesScreen';
import { refreshThreads, resetThreadsRuntime } from '@/features/messages/threads';
import { ThreadView } from '@/features/messages/ThreadView';
import { api, ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

type MockSystem = typeof AsterSystem & {
  __state: {
    threads: CapturedThread[];
    messages: Record<string, CapturedMessage[]>;
    seen: string[];
    replies: { key: string; text: string }[];
    replyResult: 'sent' | 'no-action';
  };
  __reset(): void;
};
const system = AsterSystem as MockSystem;
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

function thread(key: string, overrides: Partial<CapturedThread> = {}): CapturedThread {
  return {
    key,
    source: 'whatsapp',
    title: 'Asha Kulkarni',
    isGroup: false,
    count: 2,
    unreadSenders: ['Asha Kulkarni', 'Asha Kulkarni'],
    spokenAt: null,
    canReply: true,
    last: message(2, key),
    ...overrides,
  };
}

const asha = thread('whatsapp-aaaaaaaaaaaaaaaaaaaa');
const bank = thread('sms-bbbbbbbbbbbbbbbbbbbb', {
  source: 'sms',
  title: 'BANK-ALERT',
  unreadSenders: ['BANK-ALERT'],
  last: message(3, 'sms-bbbbbbbbbbbbbbbbbbbb', {
    source: 'sms',
    sender: 'BANK-ALERT',
    text: 'Your OTP is 482913',
    otp: true,
  }),
});

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
  mockPush.mockClear();
  system.__reset();
  resetThreadsRuntime();
  resetAlertsRuntime();
  resetDeviceUploadsRuntime();
  await resetFirstRun();
  await AsyncStorage.clear();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
  await unlockOwner('123456');
  finishFirstRun([]);
  system.__state.threads = [asha, bank];
  system.__state.messages[asha.key] = [
    message(1, asha.key, { text: 'Call me when you’re free', spokenAt: AT + 10 * 60_000 }),
    message(2, asha.key),
  ];
  system.__state.messages[bank.key] = [bank.last];
  await refreshThreads();
});

afterEach(() => jest.restoreAllMocks());

describe('4.1 Messages', () => {
  test('VIPs above everyone else, with unread counts; one-time codes stay hidden', async () => {
    await addAshaAsVip();
    await render(<MessagesScreen />);
    expect(screen.getByText(listCopy.vip)).toBeTruthy();
    expect(screen.getByText(listCopy.everyoneElse)).toBeTruthy();
    expect(screen.getByLabelText(/^Asha Kulkarni, WhatsApp, .*, 2 unread$/)).toBeTruthy();
    expect(screen.getByText(listCopy.otpHidden)).toBeTruthy();
    expect(screen.queryByText(/482913/)).toBeNull();
    // Filter chips count unread messages per app.
    expect(screen.getByLabelText('All, 3 unread')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('SMS, 1 unread'));
    expect(screen.queryByText('Asha Kulkarni')).toBeNull();
    expect(screen.getByText('BANK-ALERT')).toBeTruthy();
  });

  test('without VIPs everything is under "Everyone else"; a row opens 4.2', async () => {
    await render(<MessagesScreen />);
    expect(screen.queryByText(listCopy.vip)).toBeNull();
    await fireEvent.press(screen.getByLabelText(/^Asha Kulkarni, WhatsApp/));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/thread/[key]', params: { key: asha.key } });
  });

  test('notification access off shows the callout with Allow', async () => {
    jest.mocked(AsterSystem.isNotificationListenerEnabled).mockReturnValue(false);
    await refreshThreads();
    await render(<MessagesScreen />);
    expect(screen.getByText(listCopy.accessOff)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(/Allow Notification access/));
    expect(AsterSystem.openNotificationListenerSettings).toHaveBeenCalled();
  });

  test('nothing captured yet', async () => {
    system.__state.threads = [];
    await refreshThreads();
    await render(<MessagesScreen />);
    expect(screen.getByText(listCopy.empty)).toBeTruthy();
  });
});

describe('4.2 Thread', () => {
  test('shows the messages, marks the chat read and the spoken marker', async () => {
    await render(<ThreadView threadKey={asha.key} />);
    expect(await screen.findByText('Call me when you’re free')).toBeTruthy();
    expect(screen.getByText(/Aster read these aloud at/)).toBeTruthy();
    expect(system.__state.seen).toContain(asha.key);
  });

  test('Send replies through the notification and logs reply_sent without the text', async () => {
    jest.spyOn(api, 'postActivity').mockRejectedValue(new ApiError(0, 'offline'));
    await render(<ThreadView threadKey={asha.key} />);
    await fireEvent.changeText(screen.getByLabelText(copy.yourReply), 'I’ll call you at 9');
    await fireEvent.press(screen.getByLabelText(copy.send('WhatsApp')));
    expect(system.__state.replies).toEqual([{ key: asha.key, text: 'I’ll call you at 9' }]);
    expect(screen.getByText(/Sent through WhatsApp at/)).toBeTruthy();
    const { events } = await readDeviceUploads();
    expect(events).toMatchObject([
      { type: 'reply_sent', summary: 'Replied on WhatsApp', meta: { source: 'whatsapp' } },
    ]);
    expect(JSON.stringify(events)).not.toContain('call you');
  });

  test('a gone notification disables Send and offers the app', async () => {
    system.__state.replyResult = 'no-action';
    await render(<ThreadView threadKey={asha.key} />);
    await fireEvent.changeText(screen.getByLabelText(copy.yourReply), 'Hi');
    await fireEvent.press(screen.getByLabelText(copy.send('WhatsApp')));
    expect(screen.getByText(copy.gone('WhatsApp'))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(copy.open('WhatsApp')));
    expect(AsterSystem.openSourceApp).toHaveBeenCalledWith(asha.key, 'whatsapp');
  });

  test('the star makes the sender a VIP on Laravel', async () => {
    await render(<ThreadView threadKey={asha.key} />);
    await fireEvent.press(screen.getByLabelText(copy.vipButton));
    expect(useAlertsStore.getState().vips).toMatchObject([
      { name: 'Asha Kulkarni', match_key: 'Asha Kulkarni', sources: ['whatsapp'], enabled: true },
    ]);
    expect(screen.getByText('WhatsApp · VIP')).toBeTruthy();
  });

  test('a one-time code shows only when tapped', async () => {
    await render(<ThreadView threadKey={bank.key} />);
    expect(await screen.findByText(listCopy.otpHidden)).toBeTruthy();
    await fireEvent.press(screen.getByText(listCopy.otpHidden));
    expect(screen.getByText('Your OTP is 482913')).toBeTruthy();
  });
});
