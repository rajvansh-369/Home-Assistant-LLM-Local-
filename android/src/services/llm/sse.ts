// zypherLL's chat stream (docs/aster-home-chat-plan.md §6): server-sent events in the OpenAI chunk
// format, with zypherLL's own `zypher` field for progress and the final metadata. Pure, so the
// parsing is unit tested without a network.
import type { FinishReason, Source } from '@/services/api/types';

/** The final chunk's `zypher` object (llm/zypher/presenter/assistant.py, llm/markl/engine.py). */
export type ZypherMeta = {
  sampling?: 'precise' | 'balanced' | 'creative' | null;
  live?: boolean;
  sources?: Source[];
  cited?: boolean;
  recalled?: number | null;
  memory_id?: number | null;
  tools?: string[];
  seconds?: number | null;
};

export type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

export type ChatEvent =
  | {
      type: 'status';
      stage: 'searching' | 'recalled' | 'tool' | string;
      count?: number;
      tool?: string;
    }
  | { type: 'text'; text: string }
  | { type: 'done'; finishReason: FinishReason; usage: Usage | null; meta: ZypherMeta }
  | { type: 'error'; message: string };

/**
 * Splits a byte stream's text into SSE `data:` payloads. Events end with a blank line; `\r\n`
 * works too. Returns `push` (feed decoded text) and `end` (flush what is left).
 */
export function createSseParser(onData: (data: string) => void) {
  let buffer = '';

  function drain(final: boolean) {
    buffer = buffer.replace(/\r\n/g, '\n');
    let end = buffer.indexOf('\n\n');
    while (end !== -1 || (final && buffer.trim() !== '')) {
      const block = end === -1 ? buffer : buffer.slice(0, end);
      buffer = end === -1 ? '' : buffer.slice(end + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data !== '') onData(data);
      end = buffer.indexOf('\n\n');
    }
  }

  return {
    push(text: string) {
      buffer += text;
      drain(false);
    },
    end() {
      drain(true);
    },
  };
}

const FINISH: readonly string[] = ['stop', 'length', 'cancelled', 'error'];

/** One `data:` payload to an event; null for `[DONE]`, the role-only first chunk and noise. */
export function parseChatEvent(data: string): ChatEvent | null {
  if (data === '[DONE]') return null;
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (json.error && typeof json.error === 'object') {
    const message = (json.error as { message?: unknown }).message;
    return { type: 'error', message: typeof message === 'string' ? message : 'Unknown error' };
  }

  const choice = Array.isArray(json.choices)
    ? (json.choices[0] as { delta?: { content?: unknown }; finish_reason?: unknown } | undefined)
    : undefined;
  const zypher =
    json.zypher && typeof json.zypher === 'object'
      ? (json.zypher as Record<string, unknown>)
      : null;

  if (choice && typeof choice.finish_reason === 'string') {
    const reason = FINISH.includes(choice.finish_reason)
      ? (choice.finish_reason as FinishReason)
      : 'stop';
    return {
      type: 'done',
      finishReason: reason,
      usage: (json.usage as Usage | undefined) ?? null,
      meta: (zypher ?? {}) as ZypherMeta,
    };
  }
  if (zypher && typeof zypher.stage === 'string') {
    return {
      type: 'status',
      stage: zypher.stage,
      ...(typeof zypher.count === 'number' ? { count: zypher.count } : {}),
      ...(typeof zypher.tool === 'string' ? { tool: zypher.tool } : {}),
    };
  }
  const content = choice?.delta?.content;
  if (typeof content === 'string' && content !== '') return { type: 'text', text: content };
  return null;
}
