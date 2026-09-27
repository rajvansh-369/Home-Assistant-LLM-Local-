// "Use my area in answers" (docs/aster-reminders-location-plan.md §5): the city of the latest fix,
// worked out on the phone, at most every 30 minutes and only in the foreground. Chat prompts get
// the city name, never coordinates, while `share_area` and "Save my location" are on.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { location as copy } from './copy';
import { ensureLocationLoaded, useLocationStore } from './settings';

export const AREA_KEY = 'aster.area';
export const AREA_EVERY_MS = 30 * 60 * 1000;
/** An older city isn't used: the phone may be elsewhere by now. */
export const AREA_STALE_MS = 12 * 60 * 60 * 1000;

type Area = { city: string; at: number };

let area: Area | null = null;
let loaded = false;

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(AREA_KEY);
    if (raw) area = JSON.parse(raw) as Area;
  } catch {
    area = null;
  }
}

const sharing = () => {
  const { settings } = useLocationStore.getState();
  return settings.share_area && settings.enabled;
};

/** Updates the city if sharing is on and the last look is 30 minutes old. Never throws. */
export async function refreshArea(now = Date.now()): Promise<void> {
  try {
    await ensureLocationLoaded();
    await load();
    if (!sharing()) return;
    if (area && now - area.at < AREA_EVERY_MS) return;
    const fix = await Location.getLastKnownPositionAsync();
    if (!fix) return;
    const [place] = await Location.reverseGeocodeAsync({
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
    });
    const city = place?.city ?? place?.subregion ?? place?.district ?? null;
    if (!city) return;
    area = { city, at: now };
    await AsyncStorage.setItem(AREA_KEY, JSON.stringify(area));
  } catch {
    // No fix, no geocoder, or no permission: answers go without the area.
  }
}

/** The system line for a chat prompt, or null. Synchronous: read at send time. */
export function areaLine(now = Date.now()): string | null {
  if (!sharing() || !area || now - area.at > AREA_STALE_MS) return null;
  return copy.areaPrompt(area.city);
}

/** Sign-out, reset and tests. */
export async function forgetArea() {
  area = null;
  loaded = true;
  await AsyncStorage.removeItem(AREA_KEY).catch(() => {});
}

/** Tests only. */
export function resetAreaRuntime() {
  area = null;
  loaded = false;
}
