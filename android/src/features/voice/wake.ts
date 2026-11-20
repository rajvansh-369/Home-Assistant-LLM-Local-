// When "Hey Aster" may listen (docs/aster-voice-plan.md §6, §7) and the controller that starts and
// stops the native wake word service to match. It listens while a profile with voice is unlocked,
// the phone is at home and the 5.1 switch is on. Android 14+ only lets a microphone service start
// while Aster is in front, so a start waits for the app to be active; once running it keeps going
// with the screen off. Leaving home also stops it natively (the geofence task may run headless).
import { AppState } from 'react-native';

import { isUnlocked, useFirstRunStore, type Session } from '@/features/first-run/store';
import { isAtHome, type HomeMode } from '@/features/home-mode/mode';
import { useHomeModeStore } from '@/features/home-mode/store';
import { useAlertsStore } from '@/features/messages/alerts';
import type { VipContact } from '@/services/api';
import { colors } from '@/theme/colors';

import AsterSystem from '../../../modules/aster-system';

import { voiceAllowed } from './access';
import { voice as copy } from './copy';
import { useVoiceSettings } from './settings';

export type WakeFacts = {
  session: Session | null;
  mode: HomeMode;
  wakeWord: boolean;
  now?: number;
};

/** The wake word may listen now. */
export function wakeAllowed({ session, mode, wakeWord, now = Date.now() }: WakeFacts): boolean {
  return wakeWord && isUnlocked(session, now) && voiceAllowed(session?.profile) && isAtHome(mode);
}

/** What the service is told: the notification's words and when the session ends. */
export function wakeConfig(session: Session, vips: VipContact[]) {
  const listeningFor = session.profile.role === 'owner' ? vips.filter((v) => v.enabled).length : 0;
  return {
    copy: {
      channel: copy.wake.channel,
      title: listeningFor > 0 ? copy.wake.listeningFor(listeningFor) : copy.wake.listening,
      body: copy.wake.body,
      pause: copy.wake.pause,
      resume: copy.wake.resume,
      settings: copy.wake.settings,
      paused: copy.wake.paused,
      locked: copy.wake.locked,
      heardTitle: copy.wake.heardTitle,
      heardBody: copy.wake.heardBody,
    },
    accent: colors.accent,
    lockAt: Date.parse(session.expiresAt),
    autoLockMinutes: session.profile.auto_lock_minutes ?? null,
  };
}

/** Applies the rules to the service. Never throws; safe to call often. */
export function syncWakeWord() {
  try {
    const { session } = useFirstRunStore.getState();
    const want = wakeAllowed({
      session,
      mode: useHomeModeStore.getState().mode,
      wakeWord: useVoiceSettings.getState().wakeWord,
    });
    const running = AsterSystem.wakeWordState().running;
    if (!want) {
      lastConfig = null;
      if (running) AsterSystem.stopWakeWord();
      return;
    }
    const config = JSON.stringify(wakeConfig(session!, useAlertsStore.getState().vips));
    if (running && config === lastConfig) return;
    // Android 14+: a microphone service starts only with Aster in front; a running one takes new
    // rules at any time.
    if (!running && AppState.currentState !== 'active') return;
    lastConfig = AsterSystem.startWakeWord(config) ? config : null;
  } catch {
    // No native side.
  }
}

let lastConfig: string | null = null;
let installed = false;

/** Called once at launch. `openVoice` opens 3.6 when "Hey Aster" is heard with Aster in front. */
export function installWakeWord(openVoice: () => void) {
  if (installed) return;
  installed = true;
  useFirstRunStore.subscribe((state, previous) => {
    if (state.session !== previous.session) syncWakeWord();
  });
  useHomeModeStore.subscribe((state, previous) => {
    if (state.mode.kind !== previous.mode.kind) syncWakeWord();
  });
  useVoiceSettings.subscribe((state, previous) => {
    if (state.wakeWord !== previous.wakeWord) syncWakeWord();
  });
  useAlertsStore.subscribe((state, previous) => {
    if (state.vips !== previous.vips) syncWakeWord();
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') syncWakeWord();
  });
  AsterSystem.addListener('onWakeWord', () => {
    if (isUnlocked(useFirstRunStore.getState().session)) openVoice();
  });
  syncWakeWord();
}

/** A voice turn takes the microphone from the wake word, and gives it back. Never throws. */
export function holdWakeWord(hold: boolean) {
  try {
    AsterSystem.holdWakeWord(hold);
  } catch {
    // No native side.
  }
}

/** Tests only. */
export function resetWakeRuntime() {
  installed = false;
  lastConfig = null;
}
