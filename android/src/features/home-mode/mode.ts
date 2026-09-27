// Home mode (docs/aster-home-chat-plan.md §5, integration spec "Home mode"): pure rules, so each
// transition can be tested without a phone.
import type { Point } from '@/features/first-run/geo';
import type { EngineOption, LlmEngine, LlmHealth } from '@/services/api';

export type HomeMode =
  /** No home saved: nothing to detect. */
  | { kind: 'noHome' }
  /** `me`: the phone's last known position, for the 3.2 map. */
  | { kind: 'away'; distanceM: number | null; me?: Point | null }
  /** At home, `/health` not answered yet. */
  | { kind: 'checking' }
  | { kind: 'loading' }
  /** `busy`: the home PC is answering someone else right now. */
  | { kind: 'ready'; busy: boolean }
  | { kind: 'noServer' }
  | { kind: 'failed'; error: string };

export type HomeModeKind = HomeMode['kind'];

/** zypherLL's model id for the local engine (`MODEL_ID` in llm/zypher/config.py). */
export const LOCAL_MODEL_ID = 'zephyr-7b';

/** Only chat needs Ready; these kinds mean the phone is at home. */
export const AT_HOME: readonly HomeModeKind[] = [
  'checking',
  'loading',
  'ready',
  'noServer',
  'failed',
];

export const isAtHome = (mode: HomeMode) => AT_HOME.includes(mode.kind);

/**
 * What `/health` says about the profile's engine. zypherLL with Mark-L reports each engine in
 * `engines`, and its top-level `status` is the default engine's, so a profile on Mark-L can be
 * ready while Zephyr is still loading.
 */
export function modeFromHealth(health: LlmHealth, engine: LlmEngine): HomeMode {
  if (health.kind === 'no-reply' || health.kind === 'unexpected' || health.kind === 'blocked') {
    return { kind: 'noServer' };
  }
  const state = health.server?.engines[engine];
  if (state !== undefined) {
    if (state === 'ready') return { kind: 'ready', busy: health.server!.busy };
    if (state === 'loading') return { kind: 'loading' };
    const error =
      health.kind === 'failed' && health.server?.engine === engine ? health.error : state;
    return { kind: 'failed', error };
  }
  if (health.kind === 'ready') return { kind: 'ready', busy: false };
  if (health.kind === 'loading') return { kind: 'loading' };
  return { kind: 'failed', error: health.error };
}

/** The model named in chips and the chat header: "zephyr-7b", or Mark-L's admin-panel name. */
export function modelLabel(engine: LlmEngine, engines: EngineOption[]): string {
  if (engine === 'local') return LOCAL_MODEL_ID;
  return engines.find((e) => e.id === engine)?.name ?? 'Mark-L';
}

export type HomeSignals = {
  /** The connected Wi-Fi is the saved home Wi-Fi. */
  onHomeWifi: boolean;
  /** Inside the home area: from the phone's position, else the last geofence event; null unknown. */
  inside: boolean | null;
  /** The phone is known to be outside: a position beyond the radius, or a geofence exit. */
  leftArea: boolean;
};

/** Grace for losing home Wi-Fi before switching to Away (spec: 2 minutes). */
export const WIFI_GRACE_MS = 2 * 60_000;

export type Presence =
  | { kind: 'home' }
  | { kind: 'away' }
  /** Was home, lost the signal: stay as we are until `until`, then Away. */
  | { kind: 'grace'; until: number };

/**
 * Whether the phone is at home now. Home Wi-Fi or the home area counts. Leaving the area switches
 * to Away at once; losing Wi-Fi without leaving the area waits WIFI_GRACE_MS first.
 */
export function presence(
  signals: HomeSignals,
  wasHome: boolean,
  lostAt: number | null,
  now: number,
): Presence {
  if (signals.onHomeWifi || signals.inside === true) return { kind: 'home' };
  if (!wasHome || signals.leftArea) return { kind: 'away' };
  const since = lostAt ?? now;
  return now - since >= WIFI_GRACE_MS
    ? { kind: 'away' }
    : { kind: 'grace', until: since + WIFI_GRACE_MS };
}

/** How long until the next check (spec: loading every 10 s, no server every 60 s). */
export function nextCheckMs(mode: HomeMode): number | null {
  switch (mode.kind) {
    case 'loading':
    case 'checking':
      return 10_000;
    case 'failed':
      // "Show the error from /health; no retry loop": coming back to the app checks again.
      return null;
    case 'noHome':
      return null;
    default:
      return 60_000;
  }
}
