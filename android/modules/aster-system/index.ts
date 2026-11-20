// Aster's local Expo module (Kotlin, Android only). See plan §7, docs/aster-messages-alerts-plan.md
// §2, docs/aster-voice-plan.md §2 and android/src/main/java.
import { requireOptionalNativeModule } from 'expo';

export type MessageSource = 'whatsapp' | 'google_chat' | 'sms';

/** One captured message. Times are ms since the epoch. */
export type CapturedMessage = {
  id: number;
  threadKey: string;
  source: MessageSource;
  /** The sender as the notification named them; empty for the user's own replies. */
  sender: string;
  text: string;
  at: number;
  /** A reply sent from 4.2. */
  outgoing: boolean;
  /** Looks like a one-time code: hidden until tapped, never spoken or sent to zypherLL. */
  otp: boolean;
  read: boolean;
  /** When Aster read it aloud, else null. */
  spokenAt: number | null;
};

/** A captured conversation: one chat in one app. */
export type CapturedThread = {
  /** `{source}-{hash}`: names no one; also the 4.2 route param. */
  key: string;
  source: MessageSource;
  /** The chat's name: the contact, the number or the group. */
  title: string;
  isGroup: boolean;
  count: number;
  /** The sender of each unread received message, oldest first. */
  unreadSenders: string[];
  spokenAt: number | null;
  /** Its notification is still in the tray with a Reply action. */
  canReply: boolean;
  last: CapturedMessage;
};

/** "sent", or "no-action" when the thread's notification (and its Reply) is gone. */
export type ReplyResult = 'sent' | 'no-action';

export type Subscription = { remove(): void };

/** Why a listen ended without words. `cancelled` follows stop / cancel. */
export type SpeechErrorKind =
  'no-speech' | 'permission' | 'busy' | 'network' | 'language' | 'audio' | 'cancelled' | 'failed';

/** A voice of the phone's TextToSpeech that works offline. */
export type DeviceVoice = { name: string; locale: string; quality: number };

type AsterSystemEvents = {
  /** Messages were captured, read or alerted on. */
  onMessagesChanged: () => void;
  /** An activity event is waiting in `takeActivity`. */
  onActivity: () => void;
  /** The recognizer is ready (`listening`), hears speech (`speaking`) or heard the end (`ended`). */
  onSpeechState: (event: { session: number; state: 'listening' | 'speaking' | 'ended' }) => void;
  /** What has been heard so far. */
  onSpeechPartial: (event: { session: number; text: string }) => void;
  /** The listen's final words. */
  onSpeechResult: (event: { session: number; text: string }) => void;
  onSpeechError: (event: { session: number; kind: SpeechErrorKind }) => void;
  /** A `speakQueued` sentence was said (or couldn't be). */
  onSpeakDone: (event: { id: string; spoken: boolean }) => void;
  /** "Hey Aster" was heard while Aster was in front (otherwise the service opens 3.6 itself). */
  onWakeWord: () => void;
};

/** The wake word service as it is (docs/aster-voice-plan.md §6). */
export type WakeWordState = {
  running: boolean;
  /** Recording now (not paused, locked, on a call or held by a voice turn). */
  listening: boolean;
  /** Epoch ms "Pause 1 hour" ends; 0 when not paused. */
  pausedUntil: number;
  locked: boolean;
  /** Why the last start failed: no microphone permission, not in front, no models. */
  error: 'permission' | 'foreground' | 'models' | null;
  /** The classifier loaded: "hey_aster", or "hey_jarvis_v0.1" in debug builds until it exists. */
  keyword: string | null;
};

type AsterSystemModule = {
  /** Aster is in the list of enabled notification listeners. */
  isNotificationListenerEnabled(): boolean;
  /** Opens Notification access (Aster's own page on Android 11+). False if nothing opened. */
  openNotificationListenerSettings(): boolean;
  /** Battery use is "Unrestricted". */
  isIgnoringBatteryOptimizations(): boolean;
  /** Shows the system dialog that turns battery optimisation off for Aster. */
  requestIgnoreBatteryOptimizations(): boolean;

  /** Every captured thread, newest first. */
  listThreads(): Promise<CapturedThread[]>;
  /** The thread's newest `limit` messages, oldest first. */
  threadMessages(key: string, limit: number): Promise<CapturedMessage[]>;
  /** 4.2 opened: the thread is read, its timers and missed notification go. */
  markThreadSeen(key: string): Promise<void>;
  /** Replies through the source app's notification. Nothing is sent otherwise. */
  sendReply(key: string, text: string): Promise<ReplyResult>;
  /** Opens the chat in its app (or the app). False if it couldn't. */
  openSourceApp(key: string, source: MessageSource): boolean;
  /** Sign-out and reset: messages, timers, rules and queued events. */
  clearMessages(): Promise<void>;

  /** The rules as JSON (see features/messages/alerts.ts), or null for the defaults. */
  setAlertConfig(json: string | null): void;
  setAtHome(atHome: boolean): void;
  /** The Owner's zypherLL access for Summary mode, held in memory only; nulls when locked. */
  setLlmAccess(url: string | null, token: string | null, expiresAt: number | null): void;
  /** Speaks in the phone's voice; resolves true once said. */
  speak(text: string): Promise<boolean>;
  stopSpeaking(): void;
  /** The queued activity events as a JSON array; the queue is emptied. */
  takeActivity(): string;

  /** A recognizer exists, and whether it works without the network. */
  speechAvailability(): { available: boolean; onDevice: boolean };
  /**
   * Starts listening (one at a time); returns the listen's session for its events. `language` is a
   * BCP 47 tag or null for the phone's; `maxMs` caps a listen that never ends (1–60 s).
   */
  startListening(language: string | null, maxMs: number): number;
  /** Ends listening; the final result still comes. */
  stopListening(): void;
  /** Ends listening with no result. */
  cancelListening(): void;
  /** Queues one sentence; `onSpeakDone` with `id` follows. */
  speakQueued(text: string, id: string): void;
  /** The voice (null: the phone's default) and speed (0.5–2) for what is spoken next. */
  setVoiceSettings(voice: string | null, rate: number): void;
  /** The phone's offline voices. */
  listVoices(): Promise<DeviceVoice[]>;

  /**
   * Starts the wake word service, or hands new rules to the running one (JSON: the notification's
   * words, `accent`, `lockAt` epoch ms, `autoLockMinutes`). False when it couldn't start.
   */
  startWakeWord(config: string): boolean;
  stopWakeWord(): void;
  /** "Pause 1 hour" (any minutes, 1–1440). */
  pauseWakeWord(minutes: number): void;
  resumeWakeWord(): void;
  /** A voice turn takes the microphone (true) or gives it back (false). */
  holdWakeWord(hold: boolean): void;
  wakeWordState(): WakeWordState;

  addListener<E extends keyof AsterSystemEvents>(
    event: E,
    listener: AsterSystemEvents[E],
  ): Subscription;
};

const native = requireOptionalNativeModule<AsterSystemModule>('AsterSystem');

if (!native && __DEV__) {
  console.warn(
    'AsterSystem native module missing (Expo Go, or a build older than Phase 6): Notification ' +
      'access, Run in background and Messages do nothing. Use a development build: ' +
      'npx expo run:android.',
  );
}

/** Stand-in when the native side is missing: nothing is allowed, captured or spoken. */
const unavailable: AsterSystemModule = {
  isNotificationListenerEnabled: () => false,
  openNotificationListenerSettings: () => false,
  isIgnoringBatteryOptimizations: () => false,
  requestIgnoreBatteryOptimizations: () => false,
  listThreads: async () => [],
  threadMessages: async () => [],
  markThreadSeen: async () => {},
  sendReply: async () => 'no-action',
  openSourceApp: () => false,
  clearMessages: async () => {},
  setAlertConfig: () => {},
  setAtHome: () => {},
  setLlmAccess: () => {},
  speak: async () => false,
  stopSpeaking: () => {},
  takeActivity: () => '[]',
  speechAvailability: () => ({ available: false, onDevice: false }),
  startListening: () => 0,
  stopListening: () => {},
  cancelListening: () => {},
  speakQueued: () => {},
  setVoiceSettings: () => {},
  listVoices: async () => [],
  startWakeWord: () => false,
  stopWakeWord: () => {},
  pauseWakeWord: () => {},
  resumeWakeWord: () => {},
  holdWakeWord: () => {},
  wakeWordState: () => ({
    running: false,
    listening: false,
    pausedUntil: 0,
    locked: false,
    error: null,
    keyword: null,
  }),
  addListener: () => ({ remove() {} }),
};

export default native ?? unavailable;
