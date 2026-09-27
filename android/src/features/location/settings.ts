// Location settings on the phone (docs/aster-reminders-location-plan.md §5 Settings): the last
// `GET /location-settings`, kept for everyone because tracking runs whoever is unlocked, and read
// by the headless location task. Only the Owner reads or changes them on Laravel.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { api } from '@/services/api';
import type { LocationSettings } from '@/services/api/types';

export const LOCATION_SETTINGS_KEY = 'aster.location-settings';

/** Laravel's defaults, until the Owner first unlocks. */
export const DEFAULT_SETTINGS: LocationSettings = {
  enabled: true,
  interval_minutes: 15,
  retention_days: 30,
  share_area: false,
  paused_until: null,
};

export type SavedLocation = {
  settings: LocationSettings;
  /** When the last kept point was recorded, so updates arriving close together make one point. */
  lastPointAt: string | null;
  /** The interval the running location updates were started with. */
  startedInterval: number | null;
};

type LocationStore = SavedLocation & {
  loaded: boolean;
  set: (patch: Partial<SavedLocation & { loaded: boolean }>) => void;
};

const empty = (): SavedLocation => ({
  settings: DEFAULT_SETTINGS,
  lastPointAt: null,
  startedInterval: null,
});

export const useLocationStore = create<LocationStore>()((set) => ({
  ...empty(),
  loaded: false,
  set: (patch) => set(patch),
}));

const store = () => useLocationStore.getState();

let loading: Promise<void> | null = null;

export function ensureLocationLoaded(): Promise<void> {
  if (!loading && store().loaded) loading = Promise.resolve();
  loading ??= (async () => {
    let saved = empty();
    try {
      const raw = await AsyncStorage.getItem(LOCATION_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SavedLocation>;
        saved = { ...saved, ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } };
      }
    } catch {
      // Defaults until the Owner next unlocks.
    }
    store().set({ ...saved, loaded: true });
  })();
  return loading;
}

let saving: Promise<void> = Promise.resolve();

export async function changeLocation(patch: Partial<SavedLocation>): Promise<void> {
  await ensureLocationLoaded();
  store().set(patch);
  saving = saving
    .then(() => {
      const { settings, lastPointAt, startedInterval } = store();
      return AsyncStorage.setItem(
        LOCATION_SETTINGS_KEY,
        JSON.stringify({ settings, lastPointAt, startedInterval } satisfies SavedLocation),
      );
    })
    .catch(() => {});
  return saving;
}

/** Points are saved now: on, and not paused. */
export function isTracking(settings: LocationSettings, now = Date.now()): boolean {
  return (
    settings.enabled && (settings.paused_until == null || Date.parse(settings.paused_until) <= now)
  );
}

/** The paused-until time while a pause is running, else null. */
export function pausedUntil(settings: LocationSettings, now = Date.now()): Date | null {
  if (!settings.paused_until) return null;
  const until = Date.parse(settings.paused_until);
  return until > now ? new Date(until) : null;
}

function ownerSession() {
  const { session, serverUrl } = useFirstRunStore.getState();
  if (!serverUrl || !isUnlocked(session) || session!.profile.role !== 'owner') return null;
  return { server: serverUrl, token: session!.profileToken };
}

/** After the Owner unlocks and when 5.3 opens. Resolves false when not possible or offline. */
export async function refreshLocationSettings(): Promise<boolean> {
  const owner = ownerSession();
  if (!owner) return false;
  try {
    const settings = await api.getLocationSettings(owner.server, owner.token);
    await changeLocation({ settings: { ...DEFAULT_SETTINGS, ...settings } });
    return true;
  } catch {
    return false;
  }
}

/**
 * 5.3's switches: shown at once, sent with the Owner's token, and put back if Laravel refuses.
 * Resolves true once saved.
 */
export async function saveLocationSettings(patch: Partial<LocationSettings>): Promise<boolean> {
  const owner = ownerSession();
  if (!owner) return false;
  await ensureLocationLoaded();
  const before = store().settings;
  await changeLocation({ settings: { ...before, ...patch } });
  try {
    const saved = await api.putLocationSettings(owner.server, owner.token, patch);
    await changeLocation({ settings: { ...DEFAULT_SETTINGS, ...saved } });
    return true;
  } catch {
    await changeLocation({ settings: before });
    return false;
  }
}

/** Sign-out and reset. */
export async function clearLocationSettings() {
  await ensureLocationLoaded();
  await changeLocation(empty());
}

/** Tests only. */
export function resetLocationRuntime() {
  loading = null;
  saving = Promise.resolve();
  store().set({ ...empty(), loaded: false });
}
