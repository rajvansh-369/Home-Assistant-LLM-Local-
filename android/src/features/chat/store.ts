// The unlocked profile's chats on this phone and its upload queue (docs/aster-home-chat-plan.md
// §7). Only that profile's chats are ever in memory: they are read from its own AsyncStorage key
// after unlock and dropped at lock. Private and Guest chats never come here.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { MessageBody, UpdateMessageBody } from '@/services/api/types';

export const chatsKey = (profileId: number) => `aster.chats.p${profileId}`;

/** A message as the phone keeps it: what Laravel gets, plus Laravel's id once uploaded. */
export type LocalMessage = MessageBody & {
  serverId?: number | null;
  /** Shown under an answer that broke off; not uploaded. */
  error?: string | null;
};

export type LocalChat = {
  clientUuid: string;
  serverId: number | null;
  title: string;
  createdAt: string;
  lastMessageAt: string | null;
  /** From Laravel's list, before the messages are loaded. */
  messageCount: number;
  messages: LocalMessage[];
  /** Every message Laravel has is here (or the chat started on this phone). */
  loaded: boolean;
};

export type Job = { id: string; attempts: number; nextAt: number; lastError?: string } & (
  | { kind: 'create'; chat: string }
  | { kind: 'post'; chat: string; messages: string[] }
  | { kind: 'update'; chat: string; message: string; body: UpdateMessageBody }
  | { kind: 'delete'; chat: string; serverId: number }
);

type Saved = { chats: Record<string, LocalChat>; queue: Job[] };

type ChatStore = Saved & {
  profileId: number | null;
  set: (patch: Partial<Saved & { profileId: number | null }>) => void;
};

export const useChatStore = create<ChatStore>()((set) => ({
  profileId: null,
  chats: {},
  queue: [],
  set: (patch) => set(patch),
}));

const store = () => useChatStore.getState();

let saveTimer: ReturnType<typeof setTimeout> | undefined;

/** Writes the current profile's chats soon (streaming changes the text many times a second). */
export function scheduleSave(delayMs = 400) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), delayMs);
}

export async function saveNow() {
  clearTimeout(saveTimer);
  const { profileId, chats, queue } = store();
  if (profileId == null) return;
  await AsyncStorage.setItem(chatsKey(profileId), JSON.stringify({ chats, queue } satisfies Saved));
}

/** After unlock: this profile's chats replace whatever was in memory. */
export async function loadChats(profileId: number) {
  if (store().profileId !== profileId) {
    await saveNow().catch(() => {});
  }
  let saved: Saved = { chats: {}, queue: [] };
  try {
    const raw = await AsyncStorage.getItem(chatsKey(profileId));
    if (raw) saved = { chats: {}, queue: [], ...(JSON.parse(raw) as Partial<Saved>) };
  } catch {
    // A broken cache starts empty; Laravel still has the uploaded chats.
  }
  store().set({ profileId, ...saved });
}

/** At lock: save, then forget the chats in memory. */
export async function unloadChats() {
  await saveNow().catch(() => {});
  store().set({ profileId: null, chats: {}, queue: [] });
}

/** Changes one chat and saves soon. */
export function updateChat(clientUuid: string, change: (chat: LocalChat) => LocalChat) {
  const chat = store().chats[clientUuid];
  if (!chat) return;
  store().set({ chats: { ...store().chats, [clientUuid]: change(chat) } });
  scheduleSave();
}

export function updateLocalMessage(
  chatUuid: string,
  messageUuid: string,
  patch: Partial<LocalMessage>,
) {
  updateChat(chatUuid, (chat) => ({
    ...chat,
    messages: chat.messages.map((m) => (m.client_uuid === messageUuid ? { ...m, ...patch } : m)),
  }));
}
