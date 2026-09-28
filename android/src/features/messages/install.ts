// Wires messages and spoken alerts to the rest of the app (docs/aster-messages-alerts-plan.md §5,
// §7): the Owner's unlock refreshes the alert settings and hands native the Owner's llm_token (in
// memory, for Summary mode), home mode tells native whether the phone is at home, the native
// engine's activity events go to the device queue, and signing out clears the captured messages.
// Called once from the root layout.
import { AppState } from 'react-native';

import { onSessionOpened } from '@/features/first-run/actions';
import { isUnlocked, useFirstRunStore, type FirstRunStore } from '@/features/first-run/store';
import { isAtHome } from '@/features/home-mode/mode';
import { useHomeModeStore } from '@/features/home-mode/store';
import { queueEvents } from '@/features/location/uploads';
import type { ActivityEventBody } from '@/services/api';

import AsterSystem from '../../../modules/aster-system';

import { clearAlerts, ensureAlertsLoaded, pushAlertConfig, refreshAlerts } from './alerts';
import { clearThreads, installThreads } from './threads';

/** The native engine's queued events (spoken_alert) into the device queue. Never throws. */
export async function drainActivity(): Promise<number> {
  let events: ActivityEventBody[] = [];
  try {
    const parsed = JSON.parse(AsterSystem.takeActivity()) as unknown;
    if (Array.isArray(parsed)) events = parsed as ActivityEventBody[];
  } catch {
    return 0;
  }
  if (events.length > 0) await queueEvents(events).catch(() => {});
  return events.length;
}

/** The Owner's llm_token and home LLM address while the Owner is unlocked; nothing otherwise. */
export function syncLlmAccess(
  state: Pick<FirstRunStore, 'session' | 'home'> = useFirstRunStore.getState(),
) {
  const { session, home } = state;
  const owner = isUnlocked(session) && session!.profile.role === 'owner' && home != null;
  try {
    if (owner) {
      AsterSystem.setLlmAccess(home!.llm_url, session!.llmToken, Date.parse(session!.expiresAt));
    } else {
      AsterSystem.setLlmAccess(null, null, null);
    }
  } catch {
    // No native side.
  }
}

/** Sign-out and reset: captured messages, the rules and queued events leave the phone. */
export async function forgetMessages() {
  await clearThreads();
  await clearAlerts();
}

let installed = false;

export function installMessages() {
  if (installed) return;
  installed = true;

  installThreads();
  // Native keeps its own copy, but hand it over again in case this build's rules are newer.
  void ensureAlertsLoaded().then(pushAlertConfig);
  void drainActivity();
  AsterSystem.addListener('onActivity', () => void drainActivity());
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void drainActivity();
  });

  onSessionOpened(async () => {
    syncLlmAccess();
    if (useFirstRunStore.getState().session?.profile.role === 'owner') await refreshAlerts();
  });

  useFirstRunStore.subscribe((state, previous) => {
    if (
      state.session?.llmToken !== previous.session?.llmToken ||
      state.session?.profile.id !== previous.session?.profile.id ||
      state.home?.llm_url !== previous.home?.llm_url
    ) {
      syncLlmAccess(state);
    }
    if (previous.hasDeviceToken && !state.hasDeviceToken) void forgetMessages();
  });

  const tellAtHome = (atHome: boolean) => {
    try {
      AsterSystem.setAtHome(atHome);
    } catch {
      // No native side.
    }
  };
  tellAtHome(isAtHome(useHomeModeStore.getState().mode));
  useHomeModeStore.subscribe((state, previous) => {
    const atHome = isAtHome(state.mode);
    if (atHome !== isAtHome(previous.mode)) tellAtHome(atHome);
  });
}
