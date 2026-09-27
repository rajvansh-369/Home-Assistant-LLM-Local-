// Which fixes become points (docs/aster-reminders-location-plan.md §5 Collecting). Periodic
// updates keep one point per interval; the home geofence adds an arrived / left point and the
// matching activity event. Nothing is kept while "Save my location" is off or paused. Runs in the
// headless tasks as well as in the app.
import * as Location from 'expo-location';

import { useFirstRunStore } from '@/features/first-run/store';
import type { LocationPointBody } from '@/services/api/types';
import { uuidV4 } from '@/services/uuid';

import { location as copy } from './copy';
import { changeLocation, ensureLocationLoaded, isTracking, useLocationStore } from './settings';
import { queueEvents, queuePoints } from './uploads';

/** A fix newer than this, and at least this accurate, stands for "here" at a geofence event. */
export const FRESH_FIX_MS = 5 * 60 * 1000;
export const FRESH_FIX_ACCURACY_M = 200;

/** Laravel's format: UTC, whole seconds, a Z. */
const apiTime = (ms: number) => `${new Date(ms).toISOString().slice(0, 19)}Z`;

type Fix = Pick<Location.LocationObject, 'coords' | 'timestamp'>;

function point(fix: Fix, event: LocationPointBody['event'], placeId?: number | null) {
  const accuracy = fix.coords.accuracy;
  return {
    client_uuid: uuidV4(),
    lat: fix.coords.latitude,
    lng: fix.coords.longitude,
    accuracy_m: accuracy == null ? null : Math.round(accuracy * 100) / 100,
    event,
    place_id: placeId ?? null,
    recorded_at: apiTime(fix.timestamp),
  } satisfies LocationPointBody;
}

/**
 * Periodic updates: keeps a fix only if it is at least `interval − 1` minutes after the last kept
 * one (Android may deliver several at once), in time order. Returns how many were kept.
 */
export async function keepPeriodicFixes(fixes: Fix[], now = Date.now()): Promise<number> {
  await ensureLocationLoaded();
  const { settings, lastPointAt } = useLocationStore.getState();
  if (!isTracking(settings, now)) return 0;

  const spacing = (settings.interval_minutes - 1) * 60 * 1000;
  let last = lastPointAt ? Date.parse(lastPointAt) : -Infinity;
  const kept: LocationPointBody[] = [];
  for (const fix of [...fixes].sort((a, b) => a.timestamp - b.timestamp)) {
    if (fix.timestamp - last < spacing) continue;
    kept.push(point(fix, 'periodic'));
    last = fix.timestamp;
  }
  if (kept.length === 0) return 0;
  await changeLocation({ lastPointAt: new Date(last).toISOString() });
  await queuePoints(kept);
  return kept.length;
}

/** The home place, also in a headless task where nothing has loaded the first-run store. */
async function homePlace() {
  const persist = useFirstRunStore.persist;
  if (!persist.hasHydrated()) await persist.rehydrate();
  return useFirstRunStore.getState().home;
}

/**
 * A geofence event: an arrived / left point and `arrived_home` / `left_home`. The last known fix
 * if it is fresh and accurate enough, else the home centre with the radius as its accuracy.
 */
export async function recordHomeEvent(type: 'enter' | 'exit', now = Date.now()) {
  await ensureLocationLoaded();
  if (!isTracking(useLocationStore.getState().settings, now)) return;
  const home = await homePlace();
  if (!home) return;

  const last = await Location.getLastKnownPositionAsync({
    maxAge: FRESH_FIX_MS,
    requiredAccuracy: FRESH_FIX_ACCURACY_M,
  }).catch(() => null);
  const fix: Fix = last
    ? { coords: last.coords, timestamp: now }
    : {
        coords: {
          latitude: home.lat,
          longitude: home.lng,
          accuracy: home.radius_m,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: now,
      };
  const arrived = type === 'enter';
  await queuePoints([point(fix, arrived ? 'arrived' : 'left', home.id)]);
  await queueEvents([
    {
      client_uuid: uuidV4(),
      profile_id: null,
      type: arrived ? 'arrived_home' : 'left_home',
      summary: arrived ? copy.activity.arrived : copy.activity.left,
      occurred_at: apiTime(now),
    },
  ]);
}
