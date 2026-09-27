// One chat turn with the unlocked profile's engine and token, and the retries the integration spec
// asks for (docs/aster-home-chat-plan.md §6 Errors): a 401 gets a fresh llm_token from Laravel and
// one retry; "out of GPU memory" retries once with less history and max_tokens 1024; a model that
// isn't ready sends home mode back to checking.
import { useFirstRunStore } from '@/features/first-run/store';
import { checkHomeMode } from '@/features/home-mode/controller';
import { api, type LlmEngine } from '@/services/api';
import { ChatError, streamChat, type ChatMessage, type ChatResult } from '@/services/llm/chat';
import type { ChatEvent } from '@/services/llm/sse';

import { OOM_MAX_TOKENS, trimForMemory } from './prompt';

const store = () => useFirstRunStore.getState();

/** The engine for this session: the phone's choice for the profile; Guest uses its own. */
export function activeEngine(): LlmEngine {
  const { session, llmEngine } = store();
  if (session?.profile.role === 'guest') return session.profile.llm_engine ?? 'local';
  return llmEngine;
}

export type AskInput = {
  messages: ChatMessage[];
  web: 'auto' | false;
  /** False for private chats and Guest. */
  memory?: false;
  signal?: AbortSignal;
  onEvent: (event: ChatEvent) => void;
};

async function refreshLlmToken(): Promise<boolean> {
  const { serverUrl, session } = store();
  if (!serverUrl || !session) return false;
  try {
    const fresh = await api.refreshLlmToken(serverUrl, session.profileToken);
    const current = store().session;
    if (current?.profileToken === session.profileToken) {
      store().set({ session: { ...current, llmToken: fresh.llm_token } });
    }
    return true;
  } catch {
    return false;
  }
}

export async function askZypher(input: AskInput): Promise<ChatResult> {
  let refreshed = false;
  let trimmed = false;
  let messages = input.messages;
  let maxTokens: number | undefined;

  for (;;) {
    const { session, home, engines } = store();
    if (!session || !home) throw new ChatError('unauthorized', 'No unlocked profile.');
    const engine = activeEngine();
    try {
      return await streamChat(
        {
          llmUrl: home.llm_url,
          llmToken: session.llmToken,
          engine,
          assistantName: engines.find((e) => e.id === engine)?.name,
          messages,
          web: input.web,
          memory: input.memory,
          maxTokens,
          signal: input.signal,
        },
        input.onEvent,
      );
    } catch (error) {
      if (!(error instanceof ChatError)) throw error;
      if (error.kind === 'unauthorized' && !refreshed) {
        refreshed = true;
        if (await refreshLlmToken()) continue;
      }
      if (error.kind === 'oom' && !trimmed) {
        trimmed = true;
        messages = trimForMemory(messages);
        maxTokens = OOM_MAX_TOKENS;
        continue;
      }
      if (error.kind === 'not-ready' || error.kind === 'no-reply') void checkHomeMode();
      throw error;
    }
  }
}
