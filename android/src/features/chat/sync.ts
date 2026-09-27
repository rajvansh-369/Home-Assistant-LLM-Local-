// Laravel's copy of the profile's chats into the phone's cache (docs/aster-home-chat-plan.md §7):
// the whole `GET /conversations` list (it has no `server_time` for a `since`, and a household's
// chat count is small), and a chat's messages the first time it opens.
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { api, type Conversation, type Message } from '@/services/api';

import { scheduleSave, useChatStore, type LocalChat, type LocalMessage } from './store';

const MAX_PAGES = 20;

const chatStore = () => useChatStore.getState();

function session() {
  const { session: current, serverUrl } = useFirstRunStore.getState();
  const profileId = chatStore().profileId;
  if (!serverUrl || !isUnlocked(current) || current!.profile.id !== profileId) return null;
  return { server: serverUrl, token: current!.profileToken };
}

export function fromServerChat(conversation: Conversation): LocalChat {
  return {
    clientUuid: conversation.client_uuid,
    serverId: conversation.id,
    title: conversation.title,
    createdAt: conversation.created_at,
    lastMessageAt: conversation.last_message_at,
    messageCount: conversation.message_count,
    messages: [],
    loaded: conversation.message_count === 0,
  };
}

/**
 * Merges Laravel's list into the cache: new chats appear, known ones get their server id and title,
 * and an uploaded chat missing from the list (deleted on another phone) leaves. Chats not uploaded
 * yet stay. Returns false when offline or locked.
 */
export async function syncChats(): Promise<boolean> {
  const auth = session();
  if (!auth) return false;
  const listed: Conversation[] = [];
  let cursor: string | null = null;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await api.listConversations(auth.server, auth.token, cursor);
      listed.push(...result.data);
      cursor = result.meta.next_cursor;
      if (!cursor) break;
    }
  } catch {
    return false;
  }

  const byUuid = new Map(listed.map((c) => [c.client_uuid, c]));
  const pendingDelete = new Set(
    chatStore()
      .queue.filter((j) => j.kind === 'delete')
      .map((j) => j.chat),
  );
  const chats: Record<string, LocalChat> = {};
  for (const [uuid, chat] of Object.entries(chatStore().chats)) {
    const server = byUuid.get(uuid);
    if (server) {
      chats[uuid] = {
        ...chat,
        serverId: server.id,
        title: server.title,
        lastMessageAt: server.last_message_at ?? chat.lastMessageAt,
        messageCount: server.message_count,
        loaded: chat.loaded && chat.messages.length >= server.message_count,
      };
    } else if (chat.serverId == null) {
      chats[uuid] = chat; // not uploaded yet
    }
  }
  for (const conversation of listed) {
    if (!chats[conversation.client_uuid] && !pendingDelete.has(conversation.client_uuid)) {
      chats[conversation.client_uuid] = fromServerChat(conversation);
    }
  }
  chatStore().set({ chats });
  scheduleSave();
  return true;
}

const toLocal = ({ id, created_at: _createdAt, ...message }: Message): LocalMessage => ({
  ...message,
  serverId: id,
});

/** Loads a chat's messages from Laravel if the cache doesn't have them all. */
export async function loadMessages(chatUuid: string): Promise<boolean> {
  const chat = chatStore().chats[chatUuid];
  if (!chat || chat.loaded || chat.serverId == null) return true;
  const auth = session();
  if (!auth) return false;
  const received: Message[] = [];
  try {
    let after = 0;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await api.listMessages(auth.server, auth.token, chat.serverId, after);
      received.push(...result.data);
      if (!result.meta.has_more || result.data.length === 0) break;
      after = result.data[result.data.length - 1].id;
    }
  } catch {
    return false;
  }
  const current = chatStore().chats[chatUuid];
  if (!current) return true;
  const local = new Map(current.messages.map((m) => [m.client_uuid, m]));
  const merged = received.map((m) => local.get(m.client_uuid) ?? toLocal(m));
  const known = new Set(merged.map((m) => m.client_uuid));
  const onlyLocal = current.messages.filter((m) => !known.has(m.client_uuid));
  chatStore().set({
    chats: {
      ...chatStore().chats,
      [chatUuid]: { ...current, messages: [...merged, ...onlyLocal], loaded: true },
    },
  });
  scheduleSave();
  return true;
}
