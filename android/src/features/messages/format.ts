// Times, names and colours for 4.1 / 4.2 (docs/aster-messages-alerts-plan.md §3).
import { home as homeCopy } from '@/features/home/copy';
import { profileColors, type ProfileColor } from '@/theme';

import type { CapturedThread } from '../../../modules/aster-system';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** "7:42 PM". */
export function clock(at: number | Date): string {
  const date = new Date(at);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** 4.1's time: "7:42 PM" today, "Yesterday", "Mon" this week, else "23 Sep". */
export function listTime(at: number, now = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(at))) / DAY_MS);
  const date = new Date(at);
  if (days <= 0) return clock(at);
  if (days === 1) return 'Yesterday'; // (proposed)
  if (days < 7) return WEEKDAYS[date.getDay()];
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** 4.2's day divider: "Today", else 3.1's "Wed, 23 Sep". */
export function dayLabel(at: number, today: string, now = new Date()): string {
  return startOfDay(new Date(at)) === startOfDay(now) ? today : homeCopy.dateLine(new Date(at));
}

export const sameDay = (a: number, b: number) =>
  startOfDay(new Date(a)) === startOfDay(new Date(b));

/** A sender's avatar colour, picked from the profile swatches by their name. */
export function nameColor(name: string): ProfileColor {
  const keys = Object.keys(profileColors) as ProfileColor[];
  let hash = 0;
  for (const char of name.trim().toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return keys[Math.abs(hash) % keys.length];
}

/**
 * People get an initial; numbers and SMS sender codes ("+91 98…", "BANK-ALERT", "AD-HDFCBK") get a
 * message icon, as on the canvas.
 */
export function hasInitial(name: string, source: CapturedThread['source']): boolean {
  if (!/\p{L}/u.test(name)) return false;
  return !(source === 'sms' && /^[A-Z0-9-]+$/.test(name.trim()));
}

/** Newest first; VIP threads with unread messages above the rest (4.1 sections decide the split). */
export const byNewest = (a: CapturedThread, b: CapturedThread) => b.last.at - a.last.at;
