// Runs home mode while the app is in the foreground (docs/aster-home-chat-plan.md §5, decision 1):
// reads home Wi-Fi, the phone's position and the geofence, then `GET {llm_url}/health`, and checks
// again on NetInfo changes, geofence events, coming back to the app, a new engine, and on a timer
// (10 s while loading, 60 s otherwise).
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import { distanceM } from '@/features/first-run/geo';
import { useFirstRunStore } from '@/features/first-run/store';
import { checkLlmHealth } from '@/services/llm/health';
import { lastKnownPosition } from '@/services/location';
import { currentWifiName } from '@/services/wifi';
import { onGeofenceEvent, readGeofenceEvents } from '@/tasks/geofence-task';

import { isAtHome, modeFromHealth, nextCheckMs, presence, type HomeSignals } from './mode';
import { useHomeModeStore } from './store';

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;
/** When home Wi-Fi went missing while at home (the 2-minute grace). */
let lostAt: number | null = null;

const setMode = useHomeModeStore.getState().set;

function schedule(ms: number | null) {
  clearTimeout(timer);
  if (ms != null && AppState.currentState !== 'background') timer = setTimeout(checkHomeMode, ms);
}

async function readSignals(home: {
  lat: number;
  lng: number;
  radius_m: number;
  wifi_ssid: string | null;
}) {
  const [ssid, position, events] = await Promise.all([
    currentWifiName().catch(() => null),
    lastKnownPosition().catch(() => null),
    readGeofenceEvents().catch(() => []),
  ]);
  const distance = position
    ? distanceM(position, { latitude: home.lat, longitude: home.lng })
    : null;
  const last = events.at(-1);
  const inside = distance != null ? distance <= home.radius_m : last ? last.type === 'enter' : null;
  const signals: HomeSignals = {
    onHomeWifi: home.wifi_ssid != null && ssid === home.wifi_ssid,
    inside,
    leftArea: inside === false,
  };
  return { signals, distance, position };
}

async function evaluate() {
  const { home, llmEngine } = useFirstRunStore.getState();
  if (!home) {
    setMode({ mode: { kind: 'noHome' } });
    schedule(null);
    return;
  }

  const now = Date.now();
  const current = useHomeModeStore.getState().mode;
  const { signals, distance, position } = await readSignals(home);
  const where = presence(signals, isAtHome(current), lostAt, now);

  if (where.kind === 'away') {
    lostAt = null;
    setMode({ mode: { kind: 'away', distanceM: distance, me: position } });
    schedule(60_000);
    return;
  }
  if (where.kind === 'grace') {
    lostAt ??= now;
    schedule(where.until - now);
    return;
  }

  lostAt = null;
  if (!isAtHome(current)) setMode({ mode: { kind: 'checking' } });
  const health = await checkLlmHealth(home.llm_url);
  const mode = modeFromHealth(health, llmEngine);
  setMode({ mode, checkedAt: Date.now() });
  schedule(nextCheckMs(mode));
}

/** Checks now (or right after a check in progress). Never throws. */
export async function checkHomeMode(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    await evaluate();
  } catch {
    schedule(60_000);
  } finally {
    running = false;
    if (again) {
      again = false;
      void checkHomeMode();
    }
  }
}

/** Starts watching; returns the function that stops it. */
export function startHomeMode(): () => void {
  const subscriptions = [
    NetInfo.addEventListener(() => void checkHomeMode()),
    onGeofenceEvent(() => void checkHomeMode()),
    useFirstRunStore.subscribe((state, previous) => {
      if (state.llmEngine !== previous.llmEngine || state.home !== previous.home)
        void checkHomeMode();
    }),
  ];
  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'active') void checkHomeMode();
    else schedule(null);
  });
  void checkHomeMode();
  return () => {
    subscriptions.forEach((unsubscribe) => unsubscribe());
    appState.remove();
    schedule(null);
  };
}

/** Tests only: forget the grace timer and any schedule. */
export function resetHomeModeController() {
  clearTimeout(timer);
  lostAt = null;
  running = false;
  again = false;
}
