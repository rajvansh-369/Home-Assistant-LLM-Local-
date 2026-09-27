// 5.3's day (docs/aster-reminders-location-plan.md §3): which calendar day, in the phone's time
// zone, and Laravel's points for it. Pure helpers plus one Owner call.
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { api } from '@/services/api';
import type { LocationDay, LocationPoint } from '@/services/api/types';

/** The phone's IANA zone, e.g. "Asia/Kolkata"; UTC when the runtime can't say. */
export function phoneTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Midnight `daysAgo` days before today, in the phone's time zone. */
export function dayStart(now: Date, daysAgo: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
}

/** YYYY-MM-DD of a local date. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Arrivals and departures, in time order. */
export const timelineOf = (points: LocationPoint[]) =>
  points.filter((p) => p.event === 'arrived' || p.event === 'left');

/** The Owner's points for that day. Throws ApiError when Laravel can't be reached or refuses. */
export async function loadDay(date: Date): Promise<LocationDay> {
  const { session, serverUrl } = useFirstRunStore.getState();
  if (!serverUrl || !isUnlocked(session)) throw new Error('No unlocked profile');
  return api.getLocations(serverUrl, session!.profileToken, dayKey(date), phoneTimeZone());
}
