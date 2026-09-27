// The chat cache, the upload queue and the sync with Laravel (docs/aster-home-chat-plan.md §7),
// against the mock server.
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  addMessages,
  createChat,
  deleteChat,
  finishTurn,
  installChatSession,
  newMessage,
  patchMessage,
  titleFrom,
  updateUploaded,
} from '@/features/chat/actions';
import { groupChats, previewOf, timeLabel } from '@/features/chat/format';
import { BACKOFF_MS, flushQueue, resetQueueRunner } from '@/features/chat/queue';
import { chatsKey, saveNow, useChatStore, type LocalChat } from '@/features/chat/store';
import { loadMessages, syncChats } from '@/features/chat/sync';
import { resetFirstRun, signIn } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { loadProfiles, lockSession, unlockProfile } from '@/features/profiles/actions';
import { ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';

const server = 'https://aster.test';
const chats = () => useChatStore.getState().chats;
const queue = () => useChatStore.getState().queue;
const session = () => useFirstRunStore.getState().session!;

let ownerId: number;
let memberId: number;

/** Let the queue's background flushes (after enqueue) finish. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  await flushQueue();
};

async function serverMessages(chatUuid: string) {
  const id = chats()[chatUuid].serverId!;
  return (await mockApi.listMessages(server, session().profileToken, id)).data;
}

/** One question and its answer, as the chat screen records them. */
function turn(chatUuid: string, question: string, answer: string) {
  const user = newMessage('user', question);
  const reply = {
    ...newMessage('assistant', answer),
    finish_reason: 'stop' as const,
    memory_id: 7,
  };
  addMessages(chatUuid, [user, reply]);
  finishTurn(chatUuid, [user.client_uuid, reply.client_uuid]);
  return { user, reply };
}

beforeAll(() => {
  setMockLatency(0, 0);
  installChatSession();
});

beforeEach(async () => {
  jest.restoreAllMocks();
  resetQueueRunner();
  await resetFirstRun();
  await AsyncStorage.clear();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
  const { profiles } = await loadProfiles();
  ownerId = profiles.find((p) => p.role === 'owner')!.id;
  memberId = profiles.find((p) => p.role === 'member')!.id;
  await unlockProfile(ownerId, '123456');
  await settle();
});

test('a new chat and its first turn reach Laravel', async () => {
  const chat = createChat('How long is the drive to Lonavala on a Sunday evening with traffic?');
  const { reply } = turn(chat, 'How long is the drive…', 'About 1.5 hours.');
  await settle();

  expect(queue()).toEqual([]);
  expect(chats()[chat].serverId).toEqual(expect.any(Number));
  expect(chats()[chat].messages.every((m) => m.serverId != null)).toBe(true);
  const stored = await serverMessages(chat);
  expect(stored.map((m) => [m.role, m.content])).toEqual([
    ['user', 'How long is the drive…'],
    ['assistant', 'About 1.5 hours.'],
  ]);
  expect(stored[1]).toMatchObject({
    client_uuid: reply.client_uuid,
    memory_id: 7,
    finish_reason: 'stop',
  });
});

test('offline, the turn waits and backs off, then goes out', async () => {
  const chat = createChat('Q');
  await settle();
  const post = jest
    .spyOn(mockApi, 'postMessages')
    .mockRejectedValueOnce(new ApiError(0, 'Network request failed'));

  turn(chat, 'Q', 'A');
  await settle();

  expect(queue()).toHaveLength(1);
  expect(queue()[0]).toMatchObject({ kind: 'post', attempts: 1 });
  expect(queue()[0].nextAt).toBeGreaterThan(Date.now() + BACKOFF_MS[0] - 1000);

  // Time passes: the retry is due.
  await flushQueue(() => Date.now() + BACKOFF_MS[0]);
  expect(post).toHaveBeenCalledTimes(2);
  expect(queue()).toEqual([]);
});

test('a rating is PATCHed once the answer is on Laravel, even when rated during its upload', async () => {
  const chat = createChat('Q');
  const { reply } = turn(chat, 'Q', 'A');
  await settle();

  patchMessage(chat, reply.client_uuid, { rating: 'good' });
  updateUploaded(chat, reply.client_uuid, { rating: 'good' });
  await settle();
  expect((await serverMessages(chat))[1].rating).toBe('good');

  const update = jest.spyOn(mockApi, 'updateMessage');
  // Rated while its post is already on the way: the PATCH follows it.
  const second = turn(chat, 'Q2', 'A2');
  patchMessage(chat, second.reply.client_uuid, { rating: 'bad' });
  updateUploaded(chat, second.reply.client_uuid, { rating: 'bad' });
  await settle();
  expect(update).toHaveBeenCalledTimes(1);
  expect((await serverMessages(chat))[3].rating).toBe('bad');
});

test('jobs wait while locked and go out after the next unlock', async () => {
  const chat = createChat('Q');
  turn(chat, 'Q', 'A');
  lockSession();
  await settle();
  // Locking forgot the chats in memory; they were saved first.
  expect(chats()).toEqual({});
  const saved = JSON.parse((await AsyncStorage.getItem(chatsKey(ownerId)))!);
  expect(saved.queue.length).toBeGreaterThan(0);

  await unlockProfile(ownerId, '123456');
  await settle();
  expect(queue()).toEqual([]);
  expect(chats()[chat].serverId).toEqual(expect.any(Number));
});

test('each profile only ever loads its own chats', async () => {
  createChat('Owner question');
  await settle();
  lockSession();
  await settle();

  await unlockProfile(memberId, '222222');
  await settle();
  expect(Object.values(chats()).map((c) => c.title)).toEqual([]);

  createChat('Member question');
  await settle();
  expect(Object.values(chats()).map((c) => c.title)).toEqual(['Member question']);
});

test('sync adds chats from other phones and drops ones deleted there; unsent chats stay', async () => {
  const kept = createChat('Uploaded');
  await settle();
  const token = session().profileToken;
  const elsewhere = await mockApi.createConversation(server, token, {
    client_uuid: '11111111-2222-4333-8444-555555555555',
    title: 'From the other phone',
  });
  await mockApi.postMessages(server, token, elsewhere.id, [
    {
      client_uuid: '11111111-2222-4333-8444-666666666666',
      role: 'user',
      content: 'Hi',
      sent_at: '2026-09-27T10:00:00Z',
    },
  ]);
  const removed = createChat('Deleted elsewhere');
  await settle();
  await mockApi.deleteConversation(server, token, chats()[removed].serverId!);
  jest.spyOn(mockApi, 'createConversation').mockRejectedValue(new ApiError(0, 'offline'));
  const unsent = createChat('Not uploaded yet');
  await settle();

  await syncChats();

  const titles = Object.values(chats())
    .map((c) => c.title)
    .sort();
  expect(titles).toEqual(['From the other phone', 'Not uploaded yet', 'Uploaded']);
  expect(chats()[kept].serverId).toEqual(expect.any(Number));
  expect(chats()[unsent].serverId).toBeNull();

  const other = chats()['11111111-2222-4333-8444-555555555555'];
  expect(other.loaded).toBe(false);
  await loadMessages(other.clientUuid);
  expect(chats()[other.clientUuid].messages.map((m) => m.content)).toEqual(['Hi']);
  expect(chats()[other.clientUuid].loaded).toBe(true);
});

test('delete removes the chat here and on Laravel', async () => {
  const chat = createChat('To delete');
  await settle();
  const id = chats()[chat].serverId!;

  deleteChat(chat);
  await settle();

  expect(chats()[chat]).toBeUndefined();
  const listed = await mockApi.listConversations(server, session().profileToken);
  expect(listed.data.map((c) => c.id)).not.toContain(id);
});

test('a chat deleted before it was uploaded never reaches Laravel', async () => {
  jest.spyOn(mockApi, 'createConversation').mockRejectedValueOnce(new ApiError(0, 'offline'));
  const chat = createChat('Gone');
  await settle();
  deleteChat(chat);
  await settle();
  expect(queue()).toEqual([]);
  expect((await mockApi.listConversations(server, session().profileToken)).data).toEqual([]);
});

test('the cache survives a restart of the chat store', async () => {
  const chat = createChat('Kept');
  await settle();
  await saveNow();
  useChatStore.setState({ chats: {}, queue: [], profileId: null });
  lockSession();
  await unlockProfile(ownerId, '123456');
  await settle();
  expect(chats()[chat].title).toBe('Kept');
});

describe('format', () => {
  const now = new Date(2026, 8, 27, 20, 0); // Sun 27 Sep, 8 PM local
  const chat = (title: string, at: Date, answer?: string): LocalChat => ({
    clientUuid: title,
    serverId: 1,
    title,
    createdAt: at.toISOString(),
    lastMessageAt: at.toISOString(),
    messageCount: 0,
    messages: answer
      ? [{ client_uuid: 'a', role: 'assistant', content: answer, sent_at: at.toISOString() }]
      : [],
    loaded: true,
  });

  test('groups by Today, This week and Earlier, newest first', () => {
    const groups = groupChats(
      [
        chat('Old', new Date(2026, 8, 15, 9, 0)),
        chat('Today late', new Date(2026, 8, 27, 19, 58)),
        chat('Tuesday', new Date(2026, 8, 22, 10, 0)),
        chat('Today early', new Date(2026, 8, 27, 8, 5)),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.chats.map((c) => c.title)])).toEqual([
      ['Today', ['Today late', 'Today early']],
      ['This week', ['Tuesday']],
      ['Earlier', ['Old']],
    ]);
    expect(
      groupChats([chat('Paneer dinners', now), chat('Goa trip', now)], now, 'goa')[0].chats.map(
        (c) => c.title,
      ),
    ).toEqual(['Goa trip']);
  });

  test('time labels', () => {
    expect(timeLabel(new Date(2026, 8, 27, 19, 58).getTime(), now)).toBe('7:58 PM');
    expect(timeLabel(new Date(2026, 8, 27, 0, 5).getTime(), now)).toBe('12:05 AM');
    expect(timeLabel(new Date(2026, 8, 22, 10, 0).getTime(), now)).toBe('Tue');
    expect(timeLabel(new Date(2026, 8, 15, 9, 0).getTime(), now)).toBe('15 Sep');
  });

  test('preview is the first line of the last answer, without Markdown', () => {
    expect(previewOf(chat('x', now, '## **Seven** ideas\n\n- one'))).toBe('Seven ideas');
    expect(previewOf(chat('x', now))).toBeUndefined();
  });

  test('titles are the first question on one line, cut at a word', () => {
    expect(titleFrom('  Plan\ntomorrow  morning ')).toBe('Plan tomorrow morning');
    const long = titleFrom(
      'Explain how a foreground service keeps running on Android while it shows a notification',
    );
    expect(long.length).toBeLessThanOrEqual(61);
    expect(long.endsWith('…')).toBe(true);
  });
});
