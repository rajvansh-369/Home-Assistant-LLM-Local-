// The catch-up (docs/aster-messages-alerts-plan.md §6): the unread messages, summed up by the local
// model at home (web and memory off, "precise"), read aloud, or handed to a private chat for "Ask
// about it". One-time codes are left out of all three. Nothing here is uploaded or logged.
import { useEffect, useState } from 'react';

import { askZypher } from '@/features/chat/ask';
import { useFirstRunStore } from '@/features/first-run/store';
import type { VipContact } from '@/services/api';
import type { ChatMessage } from '@/services/llm/chat';

import AsterSystem, {
  type CapturedMessage,
  type CapturedThread,
} from '../../../modules/aster-system';

import { sources, spoken } from './copy';
import { clock } from './format';
import { useThreadsStore } from './threads';
import { threadVip, vipFor } from './vip';

export const CATCH_UP_MESSAGES = 40;
export const CATCH_UP_MAX_TOKENS = 200;

export type UnreadItem = { thread: CapturedThread; message: CapturedMessage };

/** Unread received messages, oldest first, newest `limit`; `only` keeps the ones it approves. */
export async function unreadMessages(
  threads: CapturedThread[],
  limit = CATCH_UP_MESSAGES,
  only: (item: UnreadItem) => boolean = () => true,
): Promise<UnreadItem[]> {
  const lists = await Promise.all(
    threads
      .filter((thread) => thread.unreadSenders.length > 0)
      .map(async (thread) => {
        const recent = await AsterSystem.threadMessages(
          thread.key,
          Math.min(thread.unreadSenders.length + 10, 60),
        ).catch(() => [] as CapturedMessage[]);
        return recent
          .filter((message) => !message.read && !message.outgoing && !message.otp)
          .map((message) => ({ thread, message }));
      }),
  );
  return lists
    .flat()
    .filter(only)
    .sort((a, b) => a.message.at - b.message.at)
    .slice(-limit);
}

/** Only VIPs' messages (3.1's Read aloud). */
export const fromVip = (vips: VipContact[]) => (item: UnreadItem) =>
  vipFor(vips, item.thread.source, item.message.sender, item.thread.title, item.thread.isGroup) !=
  null;

/** Groups items by thread, keeping thread order by first message. */
function byThread(items: UnreadItem[]): UnreadItem[][] {
  const groups = new Map<string, UnreadItem[]>();
  for (const item of items) {
    const list = groups.get(item.thread.key) ?? [];
    list.push(item);
    groups.set(item.thread.key, list);
  }
  return [...groups.values()];
}

const sentence = (text: string) => {
  const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, 300);
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/** The native engine's Full wording, chat after chat: "Asha sent 2 WhatsApp messages. …". */
export function readOutText(items: UnreadItem[], vips: VipContact[]): string {
  return byThread(items)
    .map((group) => {
      const { thread } = group[0];
      const name = threadVip(thread, vips)?.name ?? thread.title;
      const count = group.length;
      return spoken.full
        .replace('{name}', name)
        .replace('{count}', String(count))
        .replace('{source}', sources[thread.source])
        .replace('{messages}', count === 1 ? spoken.message : spoken.messages)
        .replace('{texts}', group.map((item) => sentence(item.message.text)).join(' '));
    })
    .join(' ');
}

/** The messages as the model reads them, chat by chat. */
export function transcript(items: UnreadItem[]): string {
  return byThread(items)
    .map((group) => {
      const { thread } = group[0];
      const lines = group.map(
        ({ message }) => `- ${clock(message.at)} ${message.sender}: ${message.text.trim()}`,
      );
      return `${sources[thread.source]} chat "${thread.title}":\n${lines.join('\n')}`;
    })
    .join('\n\n');
}

const owner = () => useFirstRunStore.getState().session?.profile.name || 'the user';

export function catchUpPrompt(items: UnreadItem[]): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        `You catch ${owner()} up on messages they haven't read. In two or three short, plain ` +
        'sentences, say who is waiting on a reply and what about, then sum up the rest. No lists, ' +
        'no quotes, no greetings, and never repeat a code or a password.',
    },
    { role: 'user', content: transcript(items) },
  ];
}

/** The system message of "Ask about it"'s private chat. */
export function askAboutContext(items: UnreadItem[]): string {
  return (
    `These are ${owner()}'s unread messages, captured from the phone's notifications. Answer ` +
    'questions about them plainly. Never repeat a code or a password.\n\n' +
    transcript(items)
  );
}

export const catchUpKey = (items: UnreadItem[]) => items.map((item) => item.message.id).join(',');

let cache: { key: string; text: string } | null = null;

/** The summary already written for exactly these messages, if any. */
export function cachedCatchUp(items: UnreadItem[]): string | null {
  return cache && cache.key === catchUpKey(items) ? cache.text : null;
}

/** Streams the catch-up into `onText`; resolves with it and keeps it for these messages. */
export async function writeCatchUp(
  items: UnreadItem[],
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const cached = cachedCatchUp(items);
  if (cached) return cached;
  let text = '';
  const result = await askZypher({
    messages: catchUpPrompt(items),
    web: false,
    memory: false,
    engine: 'local',
    sampling: 'precise',
    maxTokens: CATCH_UP_MAX_TOKENS,
    signal,
    onEvent: (event) => {
      if (event.type !== 'text') return;
      text += event.text;
      onText(text);
    },
  });
  const final = result.text.trim();
  if (result.finishReason !== 'cancelled' && final) cache = { key: catchUpKey(items), text: final };
  return final;
}

/**
 * "Ask about it": the private chat's system message with the unread messages, or null until they
 * are read (and when `on` is false).
 */
export function useAskAboutContext(on: boolean): string | null {
  const [context, setContext] = useState<string | null>(null);
  useEffect(() => {
    if (!on) return;
    let alive = true;
    void unreadMessages(useThreadsStore.getState().threads).then((items) => {
      if (alive) setContext(askAboutContext(items));
    });
    return () => {
      alive = false;
    };
  }, [on]);
  return on ? context : null;
}

/** Tests only. */
export function resetCatchUpCache() {
  cache = null;
}
