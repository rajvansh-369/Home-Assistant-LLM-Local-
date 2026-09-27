// 3.3 Chats list helpers (docs/aster-home-chat-plan.md §4.6): day groups, time labels and the
// one-line preview. Pure, in the phone's time zone.
import { chats as copy } from './copy';
import type { LocalChat } from './store';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export type ChatGroup = { key: 'today' | 'week' | 'earlier'; label: string; chats: LocalChat[] };

export const lastActivity = (chat: LocalChat) => Date.parse(chat.lastMessageAt ?? chat.createdAt);

function groupOf(at: number, now: Date): ChatGroup['key'] {
  const today = startOfDay(now).getTime();
  if (at >= today) return 'today';
  if (at >= today - 6 * DAY_MS) return 'week';
  return 'earlier';
}

/** "7:58 PM" today, "Tue" this week, "15 Sep" before. */
export function timeLabel(at: number, now: Date): string {
  const date = new Date(at);
  const group = groupOf(at, now);
  if (group === 'today') {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
  }
  if (group === 'week') return WEEKDAYS[date.getDay()];
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** Newest first, in Today, This week and Earlier; empty groups left out. */
export function groupChats(chats: LocalChat[], now: Date, query = ''): ChatGroup[] {
  const needle = query.trim().toLowerCase();
  const sorted = chats
    .filter((chat) => !needle || chat.title.toLowerCase().includes(needle))
    .sort((a, b) => lastActivity(b) - lastActivity(a));
  const groups: ChatGroup[] = [
    { key: 'today', label: copy.groups.today, chats: [] },
    { key: 'week', label: copy.groups.week, chats: [] },
    { key: 'earlier', label: copy.groups.earlier, chats: [] },
  ];
  for (const chat of sorted)
    groups.find((g) => g.key === groupOf(lastActivity(chat), now))!.chats.push(chat);
  return groups.filter((g) => g.chats.length > 0);
}

/** The first line of the last answer, without Markdown marks. */
export function previewOf(chat: LocalChat): string | undefined {
  const answer = [...chat.messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content.trim());
  if (!answer) return undefined;
  const line =
    answer.content
      .trim()
      .split('\n')
      .find((l) => l.trim()) ?? '';
  return line
    .replace(/[#*_`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
