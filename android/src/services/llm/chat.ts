// Streaming chat with zypherLL (docs/aster-home-chat-plan.md §6): `POST {llm_url}/v1/chat/completions`
// with the profile's llm_token, `stream: true`. `fetch` from expo/fetch streams the response body
// (React Native's own fetch doesn't); AbortController stops the answer, and zypherLL stops at the
// next token. Never logs the token or the messages.
import { fetch as expoFetch } from 'expo/fetch';

import type { FinishReason, LlmEngine } from '@/services/api/types';

import {
  createSseParser,
  parseChatEvent,
  type ChatEvent,
  type Usage,
  type ZypherMeta,
} from './sse';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatRequest = {
  llmUrl: string;
  llmToken: string;
  engine: LlmEngine;
  /** Mark-L only: the admin panel's name for it. */
  assistantName?: string;
  messages: ChatMessage[];
  /** "auto" lets zypherLL decide; false turns lookups off. Never true. */
  web: 'auto' | false;
  /** False for private chats and Guest; left out otherwise (the server default). */
  memory?: false;
  /** "precise" for reply drafts and catch-ups (integration spec); left out for automatic. */
  sampling?: 'precise' | 'balanced' | 'creative';
  maxTokens?: number;
  signal?: AbortSignal;
};

export type ChatResult = {
  text: string;
  finishReason: FinishReason;
  usage: Usage | null;
  meta: ZypherMeta;
  /** Seconds from sending to the last chunk, measured on the phone. */
  seconds: number;
};

export type ChatErrorKind =
  /** 401: the llm_token expired or doesn't match this home PC. */
  | 'unauthorized'
  /** 503 while the model loads (or is off / not configured). */
  | 'not-ready'
  /** 503 out of GPU memory. */
  | 'oom'
  /** 429: Mark-L's Gemini quota. */
  | 'quota'
  /** 502: Gemini refused. */
  | 'upstream'
  /** No HTTP reply at all. */
  | 'no-reply'
  /** An `error` event in the stream, or any other status. */
  | 'failed';

export class ChatError extends Error {
  readonly kind: ChatErrorKind;
  readonly status: number;
  /** The answer so far, kept when the stream broke part-way. */
  readonly partial: string;

  constructor(kind: ChatErrorKind, message: string, status = 0, partial = '') {
    super(message);
    this.name = 'ChatError';
    this.kind = kind;
    this.status = status;
    this.partial = partial;
  }
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  body: {
    getReader(): {
      read(): Promise<{ done: boolean; value?: Uint8Array }>;
      cancel?(): Promise<void>;
    };
  } | null;
}>;

export function chatBody(request: ChatRequest) {
  return {
    stream: true,
    engine: request.engine,
    ...(request.engine === 'markl' && request.assistantName
      ? { assistant_name: request.assistantName.slice(0, 40) }
      : {}),
    messages: request.messages,
    web: request.web,
    ...(request.memory === false ? { memory: false } : {}),
    ...(request.sampling ? { sampling: request.sampling } : {}),
    ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
  };
}

function errorFor(status: number, detail: string): ChatError {
  if (status === 401) return new ChatError('unauthorized', detail, status);
  if (status === 503) {
    return new ChatError(/memory/i.test(detail) ? 'oom' : 'not-ready', detail, status);
  }
  if (status === 429) return new ChatError('quota', detail, status);
  if (status === 502) return new ChatError('upstream', detail, status);
  return new ChatError('failed', detail || `HTTP ${status}`, status);
}

function detailOf(text: string): string {
  try {
    const json = JSON.parse(text) as { detail?: unknown };
    if (typeof json.detail === 'string') return json.detail;
    if (Array.isArray(json.detail)) return 'The request was not accepted.';
  } catch {
    // not JSON
  }
  return text.slice(0, 200);
}

const isAbort = (error: unknown) =>
  error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message));

/**
 * Sends one turn and streams it into `onEvent`. Resolves with the whole answer; a Stop (abort)
 * resolves with what arrived and `finishReason: "cancelled"`. Throws ChatError otherwise.
 */
export async function streamChat(
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  fetchImpl: FetchLike = expoFetch as unknown as FetchLike,
): Promise<ChatResult> {
  const started = Date.now();
  let text = '';
  let done: Extract<ChatEvent, { type: 'done' }> | null = null;
  let streamError: string | null = null;
  const seconds = () => Math.round((Date.now() - started) / 10) / 100;
  const cancelled = (): ChatResult => ({
    text,
    finishReason: 'cancelled',
    usage: null,
    meta: {},
    seconds: seconds(),
  });

  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(`${request.llmUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.llmToken}`,
      },
      body: JSON.stringify(chatBody(request)),
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal?.aborted || isAbort(error)) return cancelled();
    throw new ChatError('no-reply', 'No reply from the home server.');
  }

  if (!response.ok) {
    throw errorFor(response.status, detailOf(await response.text().catch(() => '')));
  }
  if (!response.body)
    throw new ChatError('failed', 'The home server sent no stream.', response.status);

  const parser = createSseParser((data) => {
    const event = parseChatEvent(data);
    if (!event) return;
    if (event.type === 'text') text += event.text;
    if (event.type === 'done') done = event;
    if (event.type === 'error') streamError = event.message;
    onEvent(event);
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      if (value) parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } catch (error) {
    if (request.signal?.aborted || isAbort(error)) return cancelled();
    throw new ChatError('no-reply', 'The home server stopped answering.', response.status, text);
  }

  if (streamError) throw new ChatError('failed', streamError, response.status, text);
  const final = done as Extract<ChatEvent, { type: 'done' }> | null;
  if (!final) {
    if (request.signal?.aborted) return cancelled();
    throw new ChatError('no-reply', 'The answer ended early.', response.status, text);
  }
  return {
    text,
    finishReason: final.finishReason,
    usage: final.usage,
    meta: final.meta,
    seconds: seconds(),
  };
}
