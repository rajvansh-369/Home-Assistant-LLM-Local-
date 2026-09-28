// 4.2's suggested reply and Rewrite (docs/aster-messages-alerts-plan.md §6): the local model at home,
// web and memory off, "precise". The draft asks for JSON (a one-line summary, a draft and three short
// replies); the first {…} in the answer is read and anything unusable is a failure. One-time codes
// are left out. Nothing is sent from here: the Owner still taps Send.
import { askZypher } from '@/features/chat/ask';
import { useFirstRunStore } from '@/features/first-run/store';
import type { ChatMessage } from '@/services/llm/chat';

import type { CapturedMessage, CapturedThread } from '../../../modules/aster-system';

import { sources } from './copy';

export const DRAFT_MESSAGES = 12;
export const DRAFT_MAX_TOKENS = 400;
export const LABEL_MAX = 40;

export type ReplyOption = { label: string; text: string };
export type Suggestion = { summary: string; draft: string; replies: ReplyOption[] };
export type RewriteKind = 'shorter' | 'warmer' | 'hinglish';

const owner = () => useFirstRunStore.getState().session?.profile.name || 'the user';

function conversation(messages: CapturedMessage[]): string {
  return messages
    .filter((message) => !message.otp)
    .slice(-DRAFT_MESSAGES)
    .map((message) => `${message.outgoing ? 'You' : message.sender}: ${message.text.trim()}`)
    .join('\n');
}

export function draftPrompt(thread: CapturedThread, messages: CapturedMessage[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        `You help ${owner()} answer a ${sources[thread.source]} chat with "${thread.title}". ` +
        `Write as ${owner()}, short and natural, in the chat's own language and tone. Answer with ` +
        'JSON only, no other text: {"summary": "one short sentence on what they want", ' +
        '"draft": "a reply that answers everything", "replies": [{"label": "2 to 5 words", ' +
        '"text": "a full reply"}]} with exactly three replies that answer differently.',
    },
    { role: 'user', content: conversation(messages) },
  ];
}

const clean = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';

/** The model's JSON, loosely: the first `{` to the last `}`. Null when it isn't usable. */
export function parseSuggestion(answer: string): Suggestion | null {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(answer.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object') return null;
  const raw = json as { summary?: unknown; draft?: unknown; replies?: unknown };
  const replies = (Array.isArray(raw.replies) ? raw.replies : [])
    .map((reply): ReplyOption | null => {
      if (typeof reply === 'string') {
        const text = clean(reply);
        return text ? { label: text.slice(0, LABEL_MAX), text } : null;
      }
      const option = (reply ?? {}) as { label?: unknown; text?: unknown };
      const text = clean(option.text) || clean(option.label);
      const label = (clean(option.label) || text).slice(0, LABEL_MAX);
      return text ? { label, text } : null;
    })
    .filter((reply): reply is ReplyOption => reply != null)
    .slice(0, 3);
  const draft = clean(raw.draft) || replies[0]?.text || '';
  if (!draft) return null;
  return { summary: clean(raw.summary), draft, replies };
}

const cache = new Map<string, Suggestion>();
const cacheKey = (thread: CapturedThread, messages: CapturedMessage[]) =>
  `${thread.key}:${messages.at(-1)?.id ?? 0}`;

/** A suggestion already made for this thread as it stands, if any. */
export function cachedSuggestion(
  thread: CapturedThread,
  messages: CapturedMessage[],
): Suggestion | null {
  return cache.get(cacheKey(thread, messages)) ?? null;
}

/** Asks the local model for 4.2's card. Throws ChatError, or Error when the answer isn't usable. */
export async function draftReplies(
  thread: CapturedThread,
  messages: CapturedMessage[],
  signal?: AbortSignal,
): Promise<Suggestion> {
  const cached = cachedSuggestion(thread, messages);
  if (cached) return cached;
  const result = await askZypher({
    messages: draftPrompt(thread, messages),
    web: false,
    memory: false,
    engine: 'local',
    sampling: 'precise',
    maxTokens: DRAFT_MAX_TOKENS,
    signal,
    onEvent: () => {},
  });
  const suggestion = parseSuggestion(result.text);
  if (!suggestion) throw new Error('The model gave no usable reply.');
  cache.set(cacheKey(thread, messages), suggestion);
  return suggestion;
}

const REWRITES: Record<RewriteKind, string> = {
  shorter: 'Make the reply shorter. Keep what it says.',
  warmer: 'Make the reply warmer and friendlier. Keep what it says.',
  hinglish:
    'Rewrite the reply in Hinglish: Hindi written in Latin letters, mixed with English, the way ' +
    'friends text in India. Keep what it says.',
};

export function rewritePrompt(
  kind: RewriteKind,
  draft: string,
  thread: CapturedThread,
  messages: CapturedMessage[],
): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        `You rewrite ${owner()}'s reply in a ${sources[thread.source]} chat with ` +
        `"${thread.title}". ${REWRITES[kind]} Answer with the new reply only: no quotes, no notes.`,
    },
    {
      role: 'user',
      content: `The chat:\n${conversation(messages)}\n\nThe reply to rewrite:\n${draft.trim()}`,
    },
  ];
}

/** The rewritten reply. Throws ChatError, or Error when the answer is empty. */
export async function rewriteReply(
  kind: RewriteKind,
  draft: string,
  thread: CapturedThread,
  messages: CapturedMessage[],
  signal?: AbortSignal,
): Promise<string> {
  const result = await askZypher({
    messages: rewritePrompt(kind, draft, thread, messages),
    web: false,
    memory: false,
    engine: 'local',
    sampling: 'precise',
    maxTokens: DRAFT_MAX_TOKENS,
    signal,
    onEvent: () => {},
  });
  const text = result.text
    .trim()
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim();
  if (!text) throw new Error('The model gave no reply.');
  return text;
}

/** Tests only. */
export function resetDraftCache() {
  cache.clear();
}
