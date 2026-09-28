// Alert settings and VIP contacts on the phone (docs/aster-messages-alerts-plan.md §5 Laravel): the
// last `GET /alert-settings` and `GET /vip-contacts`, kept for everyone because alerts run whoever
// is unlocked, and handed to the native alert engine after every change. Only the Owner reads or
// changes them on Laravel. "Hide message text on lock screen" lives on the phone only.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { api, type AlertSettings, type VipContact, type VipContactBody } from '@/services/api';
import { colors } from '@/theme/colors';

import AsterSystem from '../../../modules/aster-system';

import { spoken } from './copy';

export const ALERT_SETTINGS_KEY = 'aster.alert-settings';

/** Laravel's defaults (alert_settings column defaults), until the Owner first unlocks. */
export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  enabled: true,
  missed_after_minutes: 10,
  speak_mode: 'full',
  quiet_start: null,
  quiet_end: null,
  urgent_keywords: [],
  headphones_only: false,
  only_at_home: false,
};

export type SavedAlerts = {
  settings: AlertSettings;
  vips: VipContact[];
  /** Phone only; on by default, as drawn on 5.1. */
  hideOnLockScreen: boolean;
};

type AlertsStore = SavedAlerts & {
  loaded: boolean;
  set: (patch: Partial<SavedAlerts & { loaded: boolean }>) => void;
};

const empty = (): SavedAlerts => ({
  settings: DEFAULT_ALERT_SETTINGS,
  vips: [],
  hideOnLockScreen: true,
});

export const useAlertsStore = create<AlertsStore>()((set) => ({
  ...empty(),
  loaded: false,
  set: (patch) => set(patch),
}));

const store = () => useAlertsStore.getState();

/** What the native engine reads (AlertEngine.parseConfig). */
export function alertConfig(saved: SavedAlerts) {
  return {
    settings: saved.settings,
    vips: saved.vips,
    hide_on_lock_screen: saved.hideOnLockScreen,
    accent: colors.accent,
    copy: spoken,
  };
}

/** Hands the current rules to the native engine. Never throws. */
export function pushAlertConfig() {
  try {
    AsterSystem.setAlertConfig(JSON.stringify(alertConfig(store())));
  } catch {
    // No native side (tests, Expo Go): nothing to tell.
  }
}

let loading: Promise<void> | null = null;

export function ensureAlertsLoaded(): Promise<void> {
  if (!loading && store().loaded) loading = Promise.resolve();
  loading ??= (async () => {
    let saved = empty();
    try {
      const raw = await AsyncStorage.getItem(ALERT_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SavedAlerts>;
        saved = {
          ...saved,
          ...parsed,
          settings: { ...DEFAULT_ALERT_SETTINGS, ...parsed.settings },
          vips: parsed.vips ?? [],
        };
      }
    } catch {
      // Defaults until the Owner next unlocks.
    }
    store().set({ ...saved, loaded: true });
  })();
  return loading;
}

let saving: Promise<void> = Promise.resolve();

async function change(patch: Partial<SavedAlerts>): Promise<void> {
  await ensureAlertsLoaded();
  store().set(patch);
  pushAlertConfig();
  saving = saving
    .then(() => {
      const { settings, vips, hideOnLockScreen } = store();
      return AsyncStorage.setItem(
        ALERT_SETTINGS_KEY,
        JSON.stringify({ settings, vips, hideOnLockScreen } satisfies SavedAlerts),
      );
    })
    .catch(() => {});
  return saving;
}

function ownerSession() {
  const { session, serverUrl } = useFirstRunStore.getState();
  if (!serverUrl || !isUnlocked(session) || session!.profile.role !== 'owner') return null;
  return { server: serverUrl, token: session!.profileToken };
}

/** After the Owner unlocks and when 4.3 opens. Resolves false when not possible or offline. */
export async function refreshAlerts(): Promise<boolean> {
  const owner = ownerSession();
  if (!owner) return false;
  try {
    const [settings, vips] = await Promise.all([
      api.getAlertSettings(owner.server, owner.token),
      api.listVipContacts(owner.server, owner.token),
    ]);
    await change({ settings: { ...DEFAULT_ALERT_SETTINGS, ...settings }, vips });
    return true;
  } catch {
    return false;
  }
}

/** 4.3's choices: shown at once, sent with the Owner's token, put back if Laravel refuses. */
export async function saveAlertSettings(patch: Partial<AlertSettings>): Promise<boolean> {
  const owner = ownerSession();
  if (!owner) return false;
  await ensureAlertsLoaded();
  const before = store().settings;
  await change({ settings: { ...before, ...patch } });
  try {
    const saved = await api.putAlertSettings(owner.server, owner.token, patch);
    await change({ settings: { ...DEFAULT_ALERT_SETTINGS, ...saved } });
    return true;
  } catch {
    await change({ settings: before });
    return false;
  }
}

/** A VIP's switch: shown at once, put back if Laravel refuses. */
export async function setVipEnabled(id: number, enabled: boolean): Promise<boolean> {
  const owner = ownerSession();
  if (!owner) return false;
  await ensureAlertsLoaded();
  const before = store().vips;
  await change({ vips: before.map((vip) => (vip.id === id ? { ...vip, enabled } : vip)) });
  try {
    const saved = await api.updateVipContact(owner.server, owner.token, id, { enabled });
    await change({ vips: store().vips.map((vip) => (vip.id === id ? saved : vip)) });
    return true;
  } catch {
    await change({ vips: before });
    return false;
  }
}

/**
 * The editor's Save: creates or changes a VIP contact on Laravel first, so its 422 can show on
 * the fields. Throws ApiError, or Error when the Owner isn't unlocked.
 */
export async function saveVip(id: number | null, body: VipContactBody): Promise<VipContact> {
  const owner = ownerSession();
  if (!owner) throw new Error('The Owner is not unlocked.');
  await ensureAlertsLoaded();
  const saved =
    id == null
      ? await api.createVipContact(owner.server, owner.token, body)
      : await api.updateVipContact(owner.server, owner.token, id, body);
  const others = store().vips.filter((vip) => vip.id !== saved.id);
  await change({ vips: [...others, saved].sort((a, b) => a.id - b.id) });
  return saved;
}

/** The editor's Delete. Throws ApiError. */
export async function deleteVip(id: number): Promise<void> {
  const owner = ownerSession();
  if (!owner) throw new Error('The Owner is not unlocked.');
  await api.deleteVipContact(owner.server, owner.token, id);
  await change({ vips: store().vips.filter((vip) => vip.id !== id) });
}

/** 5.1 Privacy: phone only. */
export async function setHideOnLockScreen(hide: boolean): Promise<void> {
  await change({ hideOnLockScreen: hide });
}

/** Sign-out and reset. */
export async function clearAlerts() {
  await ensureAlertsLoaded();
  await change(empty());
}

/** Tests only. */
export function resetAlertsRuntime() {
  loading = null;
  saving = Promise.resolve();
  store().set({ ...empty(), loaded: false });
}
