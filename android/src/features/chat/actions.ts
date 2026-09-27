// Saving chats (docs/aster-home-chat-plan.md §7): a chat starts on the phone with its first
// question, each finished turn is queued for Laravel, and ratings, Continue and deletes follow the
// same queue. Private and Guest chats don't come here.
import NetInfo from '@react-native-community/netinfo';

import { onSessionOpened } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import type { UpdateMessageBody } from '@/services/api/types';
import { uuidV4 } from '@/services/uuid';

import { dropJobs, enqueue, flushQueue } from './queue';
import {
  loadChats,
  scheduleSave,
  unloadChats,
  updateChat,
  updateLocalMessage,
  useChatStore,
  type LocalMessage,
} from './store';
import { syncChats } from './sync';

export const TITLE_LENGTH = 60;

const chatStore = () => useChatStore.getState();

/** Laravel's format: UTC, whole seconds, a Z. */
export const nowIso = () => `${new Date().toISOString().slice(0, 19)}Z`;

/** The first question, on one line, cut at a word near 60 characters. */
export function titleFrom(question: string): string {
  const line = question.replace(/\s+/g, ' ').trim();
  if (line.length <= TITLE_LENGTH) return line;
  const cut = line.slice(0, TITLE_LENGTH);
  const space = cut.lastIndexOf(' ');
  return `${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A new saved chat for the unlocked profile; returns its client_uuid. */
export function createChat(firstQuestion: string): string {
  const clientUuid = uuidV4();
  const at = nowIso();
  chatStore().set({
    chats: {
      ...chatStore().chats,
      [clientUuid]: {
        clientUuid,
        serverId: null,
        title: titleFrom(firstQuestion),
        createdAt: at,
        lastMessageAt: at,
        messageCount: 0,
        messages: [],
        loaded: true,
      },
    },
  });
  scheduleSave();
  enqueue({ kind: 'create', chat: clientUuid });
  return clientUuid;
}

export function newMessage(role: 'user' | 'assistant', content: string): LocalMessage {
  return { client_uuid: uuidV4(), role, content, sent_at: nowIso() };
}

export function addMessages(chatUuid: string, messages: LocalMessage[]) {
  updateChat(chatUuid, (chat) => ({
    ...chat,
    messages: [...chat.messages, ...messages],
    lastMessageAt: messages.at(-1)?.sent_at ?? chat.lastMessageAt,
  }));
}

/** The answer changed while streaming: keep it on the phone (saved soon, not uploaded yet). */
export const patchMessage = updateLocalMessage;

/** A turn finished (or stopped): upload the question and the answer. */
export function finishTurn(chatUuid: string, messageUuids: string[]) {
  enqueue({ kind: 'post', chat: chatUuid, messages: messageUuids });
}

/**
 * Rating, or Continue's longer content: PATCH once the message is on Laravel. Always queued, even
 * when its post hasn't gone yet: that post may already be on the way with the old values.
 */
export function updateUploaded(chatUuid: string, messageUuid: string, body: UpdateMessageBody) {
  const chat = chatStore().chats[chatUuid];
  if (!chat?.messages.some((m) => m.client_uuid === messageUuid)) return;
  enqueue({ kind: 'update', chat: chatUuid, message: messageUuid, body });
}

export function deleteChat(chatUuid: string) {
  const chat = chatStore().chats[chatUuid];
  if (!chat) return;
  const { [chatUuid]: _gone, ...rest } = chatStore().chats;
  chatStore().set({ chats: rest });
  dropJobs(chatUuid);
  if (chat.serverId != null) enqueue({ kind: 'delete', chat: chatUuid, serverId: chat.serverId });
  scheduleSave();
}

/**
 * After an unlock: this profile's cache now (the unlock waits for it, it's local), then anything
 * waiting to upload and Laravel's list in the background.
 */
async function afterUnlock() {
  const { session } = useFirstRunStore.getState();
  if (!session || session.profile.role === 'guest') {
    await unloadChats();
    return;
  }
  await loadChats(session.profile.id);
  void flushQueue().then(syncChats);
}

let installed = false;

/** Wires the chat cache to unlock and lock. Called once from the root layout. */
export function installChatSession() {
  if (installed) return;
  installed = true;
  onSessionOpened(afterUnlock);
  useFirstRunStore.subscribe((state, previous) => {
    if (previous.session && !state.session) void unloadChats();
  });
  // Back online: send what waited.
  NetInfo.addEventListener((state) => {
    if (state.isConnected) void flushQueue();
  });
}
