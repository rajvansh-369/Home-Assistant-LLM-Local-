// What the phone sends zypherLL for a turn (docs/aster-home-chat-plan.md §6, decision 8): the
// profile's personality as a system message (with the city, when "Use my area in answers" is on:
// reminders plan §5), the last 10 messages of the chat, then the question.
// zypherLL appends a client system message to its own prompt, which already has the date and the
// profile's notes.
import type { ChatMessage } from '@/services/llm/chat';

export const CONTEXT_MESSAGES = 10;

/** After an out-of-GPU-memory reply: send this much history instead (integration spec). */
export const OOM_CONTEXT_MESSAGES = 4;
export const OOM_MAX_TOKENS = 1024;

export type Turn = { role: 'user' | 'assistant'; content: string };

export function buildMessages({
  personality,
  area,
  context,
  history,
  question,
  limit = CONTEXT_MESSAGES,
}: {
  personality?: string | null;
  /** "The user is in or near Pune." */
  area?: string | null;
  /** What the app adds, e.g. the unread messages for "Ask about it" (messages plan §6). */
  context?: string | null;
  history: Turn[];
  question: string;
  limit?: number;
}): ChatMessage[] {
  const lines = [personality?.trim(), area?.trim(), context?.trim()].filter(Boolean);
  const system = lines.length > 0 ? [{ role: 'system' as const, content: lines.join('\n\n') }] : [];
  const recent = history.filter((turn) => turn.content.trim() !== '').slice(-limit);
  return [...system, ...recent, { role: 'user', content: question }];
}

/** Continue: the same messages, with the partial answer as the last assistant message. */
export function continueMessages(messages: ChatMessage[], partial: string): ChatMessage[] {
  return [...messages, { role: 'assistant', content: partial }];
}

/** The same turn with less history, for a retry after "out of GPU memory". */
export function trimForMemory(messages: ChatMessage[]): ChatMessage[] {
  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  // The last message is the question (or the partial answer being continued): always kept.
  return [...system, ...rest.slice(-(OOM_CONTEXT_MESSAGES + 1))];
}
