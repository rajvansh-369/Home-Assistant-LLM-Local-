// One chat on screen (docs/aster-home-chat-plan.md §4.7, §6, §7): sends a question with the
// prompt, streams the answer into the message as it arrives, and records it. Saved chats live in
// the chat store and go to Laravel; private and Guest chats live only in this screen's state.
import { useCallback, useEffect, useRef, useState } from 'react';

import { useFirstRunStore } from '@/features/first-run/store';
import { useHomeModeStore } from '@/features/home-mode/store';
import { areaLine } from '@/features/location/area';
import { ChatError, type ChatMessage } from '@/services/llm/chat';
import type { ChatEvent } from '@/services/llm/sse';

import {
  addMessages,
  createChat,
  finishTurn,
  newMessage,
  patchMessage,
  updateUploaded,
} from './actions';
import { activeEngine, askZypher, rateAnswer } from './ask';
import { chat as copy } from './copy';
import { buildMessages, continueMessages, type Turn } from './prompt';
import { useChatStore, type LocalMessage } from './store';
import { loadMessages } from './sync';

export type ChatMode = 'saved' | 'private' | 'guest';

export type LiveState = { streaming: boolean; status: string | null };

const NO_MESSAGES: LocalMessage[] = [];

function statusLabel(event: Extract<ChatEvent, { type: 'status' }>): string | null {
  if (event.stage === 'searching') return copy.status.searching;
  if (event.stage === 'recalled') return event.count ? copy.status.recalled(event.count) : null;
  if (event.stage === 'tool' && event.tool) return copy.status.tool(event.tool);
  return null;
}

export function errorText(error: unknown, engineName: string): string {
  if (!(error instanceof ChatError)) return copy.errors.generic;
  switch (error.kind) {
    case 'unauthorized':
      return copy.errors.signedOut;
    case 'not-ready':
      // "model is still loading" reads as our line; "switched off" or "not configured" as zypherLL's.
      return /loading/i.test(error.message) ? copy.errors.loading : error.message;
    case 'quota':
      return copy.errors.quota(engineName);
    case 'upstream':
      return copy.errors.upstream(engineName);
    case 'no-reply':
      return copy.errors.noReply;
    default:
      return error.message || copy.errors.generic;
  }
}

/** The messages before `index`, as prompt turns (answers that broke off with nothing are left out). */
function turnsBefore(messages: LocalMessage[], index: number): Turn[] {
  return messages
    .slice(0, index)
    .filter((m) => m.content.trim() !== '')
    .map((m) => ({ role: m.role, content: m.content }));
}

export function useChat(mode: ChatMode, initialUuid: string | null) {
  const [chatUuid, setChatUuid] = useState<string | null>(initialUuid);
  const [local, setLocal] = useState<LocalMessage[]>([]);
  const [live, setLive] = useState<Record<string, LiveState>>({});
  const profile = useFirstRunStore((state) => state.session?.profile);
  const webAllowed =
    mode !== 'guest' && profile?.web_mode !== 'never' && profile?.role !== 'restricted';
  const [webOn, setWebOn] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const requests = useRef(new Map<string, ChatMessage[]>());

  const saved = useChatStore((state) =>
    mode === 'saved' && chatUuid ? state.chats[chatUuid] : undefined,
  );
  const messages = mode === 'saved' ? (saved?.messages ?? NO_MESSAGES) : local;
  const streamingId = Object.entries(live).find(([, state]) => state.streaming)?.[0] ?? null;

  useEffect(() => {
    if (mode === 'saved' && chatUuid) void loadMessages(chatUuid);
  }, [mode, chatUuid]);

  // Leaving the screen stops an answer still streaming (saved as cancelled).
  useEffect(() => () => controller.current?.abort(), []);

  // The callbacks below read the newest list without re-creating on every streamed token.
  const latest = useRef(messages);
  useEffect(() => {
    latest.current = messages;
  });

  const add = useCallback(
    (chat: string | null, items: LocalMessage[]) => {
      if (mode === 'saved' && chat) addMessages(chat, items);
      else setLocal((current) => [...current, ...items]);
    },
    [mode],
  );

  const patch = useCallback(
    (chat: string | null, id: string, change: Partial<LocalMessage>) => {
      if (mode === 'saved' && chat) patchMessage(chat, id, change);
      else
        setLocal((current) => current.map((m) => (m.client_uuid === id ? { ...m, ...change } : m)));
    },
    [mode],
  );

  const run = useCallback(
    async (
      chat: string | null,
      replyId: string,
      request: ChatMessage[],
      upload: string[] | null,
      base: string,
    ) => {
      const abort = new AbortController();
      controller.current = abort;
      const busy = (() => {
        const current = useHomeModeStore.getState().mode;
        return current.kind === 'ready' && current.busy;
      })();
      setLive((state) => ({
        ...state,
        [replyId]: { streaming: true, status: busy ? copy.status.waiting : null },
      }));
      requests.current.set(replyId, request);
      let text = base;
      const engine = activeEngine();
      const engineName =
        useFirstRunStore.getState().engines.find((e) => e.id === engine)?.name ?? engine;
      try {
        const result = await askZypher({
          messages: request,
          web: webAllowed && webOn ? 'auto' : false,
          memory: mode === 'saved' ? undefined : false,
          signal: abort.signal,
          onEvent: (event) => {
            if (event.type === 'status') {
              const label = statusLabel(event);
              setLive((state) => ({ ...state, [replyId]: { streaming: true, status: label } }));
            } else if (event.type === 'text') {
              text += event.text;
              patch(chat, replyId, { content: text });
              setLive((state) => ({ ...state, [replyId]: { streaming: true, status: null } }));
            }
          },
        });
        const meta = result.meta;
        const content = base + result.text;
        patch(chat, replyId, {
          content,
          finish_reason: result.finishReason,
          memory_id: meta.memory_id ?? null,
          live: meta.live ?? false,
          cited: meta.cited ?? false,
          sources: meta.sources ?? [],
          recalled: meta.recalled ?? null,
          sampling: meta.sampling ?? null,
          usage: result.usage,
          seconds: meta.seconds ?? result.seconds,
          error: null,
        });
        if (mode === 'saved' && chat) {
          if (upload) finishTurn(chat, upload);
          else updateUploaded(chat, replyId, { content, finish_reason: result.finishReason });
        }
      } catch (error) {
        // `text` already holds everything that streamed in before the error.
        const partial = text;
        patch(chat, replyId, {
          content: partial,
          finish_reason: 'error',
          error: errorText(error, engineName),
        });
        // A broken answer with some text is still worth keeping on Laravel.
        if (mode === 'saved' && chat && partial.trim() !== '') {
          if (upload) finishTurn(chat, upload);
          else updateUploaded(chat, replyId, { content: partial, finish_reason: 'error' });
        }
      } finally {
        if (controller.current === abort) controller.current = null;
        setLive((state) => ({ ...state, [replyId]: { streaming: false, status: null } }));
      }
    },
    [mode, patch, webAllowed, webOn],
  );

  const send = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (!question || controller.current) return;
      let chat = chatUuid;
      if (mode === 'saved' && !chat) {
        chat = createChat(question);
        setChatUuid(chat);
      }
      // Never for Guest (reminders plan decision 10); the flag records it, not the city.
      const area = mode === 'guest' ? null : areaLine();
      const request = buildMessages({
        personality: profile?.personality,
        area,
        history: turnsBefore(latest.current, latest.current.length),
        question,
      });
      const user = { ...newMessage('user', question), ...(area ? { context: ['area'] } : {}) };
      const reply = newMessage('assistant', '');
      add(chat, [user, reply]);
      void run(chat, reply.client_uuid, request, [user.client_uuid, reply.client_uuid], '');
    },
    [add, chatUuid, mode, profile?.personality, run],
  );

  const stop = useCallback(() => controller.current?.abort(), []);

  const continueAnswer = useCallback(
    (replyId: string) => {
      if (controller.current) return;
      const list = latest.current;
      const index = list.findIndex((m) => m.client_uuid === replyId);
      if (index < 1) return;
      const partial = list[index].content;
      const question = list[index - 1];
      const request =
        requests.current.get(replyId) ??
        buildMessages({
          personality: profile?.personality,
          history: turnsBefore(list, index - 1),
          question: question.content,
        });
      patch(chatUuid, replyId, { error: null });
      void run(chatUuid, replyId, continueMessages(request, partial), null, partial);
    },
    [chatUuid, patch, profile?.personality, run],
  );

  const rate = useCallback(
    (replyId: string, rating: 'good' | 'bad') => {
      const message = latest.current.find((m) => m.client_uuid === replyId);
      if (!message || message.memory_id == null) return;
      patch(chatUuid, replyId, { rating });
      void rateAnswer(message.memory_id, rating);
      if (mode === 'saved' && chatUuid) updateUploaded(chatUuid, replyId, { rating });
    },
    [chatUuid, mode, patch],
  );

  return {
    chatUuid,
    title: saved?.title ?? null,
    messages,
    live,
    streamingId,
    send,
    stop,
    continueAnswer,
    rate,
    web: webAllowed ? { on: webOn, onToggle: () => setWebOn((on) => !on) } : undefined,
    missing: mode === 'saved' && initialUuid != null && !saved,
  };
}
