// Messages (docs/aster-messages-alerts-plan.md M1–M2): the captured threads from the native store,
// refreshed on native events, read from 4.2 and cleared on sign-out.
import AsterSystem, { type CapturedThread } from '../modules/aster-system';

import {
  clearThreads,
  installThreads,
  markThreadRead,
  refreshThreads,
  resetThreadsRuntime,
  unreadCount,
  useThreadsStore,
} from '@/features/messages/threads';

type MockSystem = typeof AsterSystem & {
  __state: { threads: CapturedThread[]; seen: string[] };
  __reset(): void;
  __emit(event: string): void;
};
const system = AsterSystem as MockSystem;

function thread(overrides: Partial<CapturedThread> = {}): CapturedThread {
  const key = overrides.key ?? 'whatsapp-0123456789abcdef0123';
  return {
    key,
    source: 'whatsapp',
    title: 'Asha Kulkarni',
    isGroup: false,
    count: 2,
    unreadSenders: ['Asha Kulkarni', 'Asha Kulkarni'],
    spokenAt: null,
    canReply: true,
    last: {
      id: 2,
      threadKey: key,
      source: overrides.source ?? 'whatsapp',
      sender: 'Asha Kulkarni',
      text: 'Are you coming on Sunday?',
      at: Date.parse('2026-09-28T14:12:00Z'),
      outgoing: false,
      otp: false,
      read: false,
      spokenAt: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  system.__reset();
  resetThreadsRuntime();
});

test('refresh reads the threads and whether notification access is on', async () => {
  system.__state.threads = [thread()];
  jest.mocked(AsterSystem.isNotificationListenerEnabled).mockReturnValueOnce(true);
  await refreshThreads();
  const state = useThreadsStore.getState();
  expect(state.loaded).toBe(true);
  expect(state.listening).toBe(true);
  expect(state.threads.map(unreadCount)).toEqual([2]);
});

test('a native change event refreshes the list', async () => {
  installThreads();
  await refreshThreads();
  expect(useThreadsStore.getState().threads).toEqual([]);
  system.__state.threads = [thread()];
  system.__emit('onMessagesChanged');
  await refreshThreads();
  expect(useThreadsStore.getState().threads).toHaveLength(1);
});

test('reading a thread clears its unread count at once and on the native side', async () => {
  system.__state.threads = [thread()];
  await refreshThreads();
  await markThreadRead('whatsapp-0123456789abcdef0123');
  expect(unreadCount(useThreadsStore.getState().threads[0])).toBe(0);
  expect(system.__state.seen).toEqual(['whatsapp-0123456789abcdef0123']);
});

test('clearing forgets every thread', async () => {
  system.__state.threads = [thread()];
  await refreshThreads();
  await clearThreads();
  expect(useThreadsStore.getState().threads).toEqual([]);
  expect(AsterSystem.clearMessages).toHaveBeenCalled();
});
