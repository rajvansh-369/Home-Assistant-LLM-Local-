// The upload queue (docs/aster-home-chat-plan.md §7): chats and messages go to Laravel in order,
// only while their profile is unlocked (the jobs need its token). Every call is safe to repeat
// (client_uuid), so a job that failed half-way just runs again. Failures back off 5 s, 30 s, 2 min,
// then every 5 min; a 422 drops the job (it would never succeed), a 404 means the chat is gone.
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { api, ApiError, type MessageBody } from '@/services/api';
import type { UpdateMessageBody } from '@/services/api/types';
import { uuidV4 } from '@/services/uuid';

import { saveNow, scheduleSave, useChatStore, type Job, type LocalMessage } from './store';

export const BACKOFF_MS = [5_000, 30_000, 120_000, 300_000];

const chatStore = () => useChatStore.getState();

type NewJob =
  | { kind: 'create'; chat: string }
  | { kind: 'post'; chat: string; messages: string[] }
  | { kind: 'update'; chat: string; message: string; body: UpdateMessageBody }
  | { kind: 'delete'; chat: string; serverId: number };

export function enqueue(job: NewJob) {
  const queued = { ...job, id: uuidV4(), attempts: 0, nextAt: 0 } as Job;
  chatStore().set({ queue: [...chatStore().queue, queued] });
  scheduleSave();
  void flushQueue();
}

/** Drops every job of a chat, e.g. when it's deleted before it was ever uploaded. */
export function dropJobs(chat: string) {
  chatStore().set({ queue: chatStore().queue.filter((job) => job.chat !== chat) });
  scheduleSave();
}

/** What Laravel stores for a message: the phone's own fields left out. */
export function uploadBody({ serverId: _id, error: _error, ...body }: LocalMessage): MessageBody {
  return body;
}

class Wait extends Error {}

async function run(job: Job, server: string, token: string) {
  const chat = chatStore().chats[job.chat];
  switch (job.kind) {
    case 'create': {
      if (!chat) return;
      if (chat.serverId != null) return;
      const created = await api.createConversation(server, token, {
        client_uuid: chat.clientUuid,
        title: chat.title,
      });
      setChatServerId(job.chat, created.id);
      return;
    }
    case 'post': {
      if (!chat) return;
      if (chat.serverId == null) throw new Wait();
      const messages = chat.messages.filter((m) => job.messages.includes(m.client_uuid));
      if (messages.length === 0) return;
      const stored = await api.postMessages(server, token, chat.serverId, messages.map(uploadBody));
      setMessageServerIds(job.chat, stored);
      return;
    }
    case 'update': {
      if (!chat) return;
      const message = chat.messages.find((m) => m.client_uuid === job.message);
      if (!message) return;
      if (message.serverId == null) throw new Wait();
      await api.updateMessage(server, token, message.serverId, job.body);
      return;
    }
    case 'delete':
      try {
        await api.deleteConversation(server, token, job.serverId);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
  }
}

function setChatServerId(chatUuid: string, serverId: number) {
  const chat = chatStore().chats[chatUuid];
  if (!chat) return;
  chatStore().set({ chats: { ...chatStore().chats, [chatUuid]: { ...chat, serverId } } });
}

function setMessageServerIds(chatUuid: string, stored: { id: number; client_uuid: string }[]) {
  const chat = chatStore().chats[chatUuid];
  if (!chat) return;
  const ids = new Map(stored.map((s) => [s.client_uuid, s.id]));
  const messages = chat.messages.map((m) =>
    ids.has(m.client_uuid) ? { ...m, serverId: ids.get(m.client_uuid) } : m,
  );
  chatStore().set({ chats: { ...chatStore().chats, [chatUuid]: { ...chat, messages } } });
}

let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

function scheduleNext() {
  clearTimeout(timer);
  const pending = chatStore().queue;
  if (pending.length === 0) return;
  const next = Math.min(...pending.map((job) => job.nextAt));
  timer = setTimeout(() => void flushQueue(), Math.max(1_000, next - Date.now()));
}

/** Sends every job that is due, in order. Stops at the first one that has to wait. */
export async function flushQueue(now = Date.now) {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    const { session, serverUrl } = useFirstRunStore.getState();
    const profileId = chatStore().profileId;
    if (!serverUrl || !isUnlocked(session) || session!.profile.id !== profileId) return;

    const blocked = new Set<string>();
    for (const job of [...chatStore().queue]) {
      if (blocked.has(job.chat) || job.nextAt > now()) {
        blocked.add(job.chat);
        continue;
      }
      try {
        await run(job, serverUrl, session!.profileToken);
        chatStore().set({ queue: chatStore().queue.filter((j) => j.id !== job.id) });
      } catch (error) {
        if (error instanceof Wait) {
          blocked.add(job.chat);
          continue;
        }
        const status = error instanceof ApiError ? error.status : -1;
        if (status === 401) break; // the session ended; the lock flow takes over
        const hopeless = status === 422 || status === 404 || status === 403;
        chatStore().set({
          queue: hopeless
            ? chatStore().queue.filter((j) => j.id !== job.id)
            : chatStore().queue.map((j) =>
                j.id === job.id
                  ? {
                      ...j,
                      attempts: j.attempts + 1,
                      nextAt: now() + BACKOFF_MS[Math.min(j.attempts, BACKOFF_MS.length - 1)],
                      lastError: error instanceof Error ? error.message : String(error),
                    }
                  : j,
              ),
        });
        blocked.add(job.chat);
      }
    }
  } finally {
    running = false;
    await saveNow().catch(() => {});
    scheduleNext();
    if (again) {
      again = false;
      void flushQueue(now);
    }
  }
}

/** Tests only. */
export function resetQueueRunner() {
  clearTimeout(timer);
  running = false;
  again = false;
}
