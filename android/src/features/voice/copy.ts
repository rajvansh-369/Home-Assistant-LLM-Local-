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

  // V3: things Aster does by voice (plan §5). All (proposed) except "Done. I'll remind you at…".
  /** "at 9:00 PM", "tomorrow at 9:00 AM", "on Friday at 9:00 AM", "when you get home". */
  reminderSaved: (when: string) => `Done. I’ll remind you ${when}.`,
  remindAt: (time: string) => `at ${time}`,
  remindTomorrow: (time: string) => `tomorrow at ${time}`,
  remindOn: (day: string, time: string) => `on ${day} at ${time}`,
  remindHome: 'when you get home',
  days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  reminderWhen: 'When should I remind you? Say a time, like “at 9”, or “when I get home”.',
  remindersOff: 'Reminders are off for this profile.',
  reminderFailed: 'Couldn’t save that reminder. Try again.',
  messagesOwnerOnly: 'Missed messages are only read out for the Owner.',
  noMessages: 'No missed messages.',
  noMessagesFrom: (name: string) => `No missed messages from ${name}.`,
  confirmReply: (text: string, name: string) => `Send “${text}” to ${name}?`,
  replySent: (name: string) => `Sent to ${name}.`,
  replyNotSent: 'Okay, not sent.',
  replyGone: (source: string) => `The ${source} notification is gone, so I can’t reply from here.`,
  replyFailed: 'Couldn’t send it. Try again.',
  /** Reply by voice away from home: the chat on screen instead. */
  openChat: 'Open the chat',
  stopped: 'Okay.',
  /** Chips under the answer. */
  say: (text: string) => `Say ‘${text}’`,
  send: 'Send',
  notNow: 'Not now',
  edit: 'Edit',
  /** The reminder card's TalkBack name. */
  reminderCard: (title: string, when: string) => `Reminder: ${title}, ${when}`,
} as const;
