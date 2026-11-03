// 3.6 Voice strings (docs/aster-voice-plan.md §3). Canvas strings are exact; the rest are marked
// (proposed) in the plan.
export const voice = {
  title: 'Voice',
  close: 'Close voice',
  listening: 'Listening',
  paused: 'Paused. Tap the mic to talk.',
  /** (proposed) */
  thinking: 'Thinking…',
  /** (proposed) */
  speaking: 'Speaking',
  startListening: 'Start listening',
  pauseListening: 'Pause listening',
  switchToTyping: 'Switch to typing',
  mute: 'Mute Aster’s voice',
  /** (proposed) */
  unmute: 'Unmute Aster’s voice',
  quoted: (text: string) => `“${text}”`,
  /** (proposed) */
  notHome: 'Voice works when you’re home.',
  /** (proposed) */
  noSpeech: 'I didn’t catch that.',
  /** (proposed) */
  micBlocked: 'Aster needs the microphone. Allow it in Settings.',
  /** (proposed) */
  micBusy: 'The microphone is busy. Try again in a moment.',
  /** (proposed) */
  noRecognizer: 'Speech recognition isn’t available on this phone.',
  /** (proposed) */
  failed: 'Voice didn’t work this time. Tap the mic to try again.',
  /** (proposed) */
  openSettings: 'Open settings',
  /** 3.1's mic button. */
  talkToAster: 'Talk to Aster',
  /** 3.4's mic in the composer. */
  talkInstead: 'Talk instead',
} as const;
