// Reminder labels and ordering (docs/aster-reminders-location-plan.md §3), pure and in the
// phone's time zone: "9:00 PM" today, "Tomorrow 10:00", "Fri 10:00" this week, "26 Sep 10:00".
import { reminders as copy } from './copy';
import type { LocalReminder } from './store';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Laravel's format: UTC, whole seconds, a Z. */
export const apiTime = (date: Date) => `${date.toISOString().slice(0, 19)}Z`;

/** "9:00 PM". */
export function clock12(date: Date): string {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

/** "10:00", as the canvas writes times on other days. */
const clock24 = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Whole days from today to `date` (0 today, 1 tomorrow, -1 yesterday). */
export function daysFrom(now: Date, date: Date): number {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
}

/** The label for a time reminder's due time. */
export function dueLabel(dueAt: string, now: Date): string {
  const date = new Date(dueAt);
  const days = daysFrom(now, date);
  if (days === 0) return clock12(date);
  if (days === 1) return `${copy.tomorrow} ${clock24(date)}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[date.getDay()]} ${clock24(date)}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${clock24(date)}`;
}

/** The editor's day pill: "Today", "Tomorrow", "Fri 2 Oct". */
export function dayLabel(date: Date, now: Date): string {
  const days = daysFrom(now, date);
  if (days === 0) return copy.today;
  if (days === 1) return copy.tomorrow;
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export const isOverdue = (reminder: LocalReminder, now: number) =>
  reminder.trigger === 'time' && reminder.dueAt != null && Date.parse(reminder.dueAt) <= now;

/**
 * "Coming up": pending only. At home, time reminders by due time, then arrive-home ones; away,
 * arrive-home first (canvas 3.2). Ties keep the order they were made in.
 */
export function comingUp(reminders: LocalReminder[], atHome: boolean): LocalReminder[] {
  const pending = reminders.filter((r) => r.status === 'pending');
  const timed = pending
    .filter((r) => r.trigger === 'time')
    .sort((a, b) => Date.parse(a.dueAt ?? '') - Date.parse(b.dueAt ?? ''));
  const home = pending
    .filter((r) => r.trigger === 'arrive_home')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return atHome ? [...timed, ...home] : [...home, ...timed];
}

/** Quick picks in the editor. `null` when that pick makes no sense now (Tonight after 8 PM). */
export function quickTimes(now: Date): {
  inHour: Date;
  tonight: Date | null;
  tomorrowMorning: Date;
} {
  const inHour = new Date(now.getTime() + 60 * 60 * 1000);
  inHour.setSeconds(0, 0);
  const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0);
  const tomorrowMorning = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  return { inHour, tonight: now.getHours() < 20 ? tonight : null, tomorrowMorning };
}
