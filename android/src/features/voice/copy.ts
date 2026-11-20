// 3.6 Voice strings (docs/aster-voice-plan.md §3). Canvas strings are exact; the rest are marked
// (proposed) in the plan.

/** "1.0×" */
const speed = (rate: number) => `${rate.toFixed(1)}×`;

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
  /** (proposed) The recognizer has no pack for the phone's language; Android was asked for it. */
  noLanguage: 'Speech recognition for your language isn’t on this phone yet. Android is downloading it; try again in a few minutes.',
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
  /** 3.6's footnote while the wake word is on (canvas). */
  wakeFootnote: 'Say ‘Hey Aster’ any time, even with the screen off.',

  /** V4: the wake word's ongoing notification and the "heard" heads-up (plan §3 4.4). */
  wake: {
    /** (proposed) */
    channel: 'Listening at home',
    listeningFor: (count: number) => `At home · listening for ${count} ${count === 1 ? 'VIP' : 'VIPs'}`,
    /** (proposed) */
    listening: 'At home · listening',
    body: 'Model ready · location on',
    pause: 'Pause 1 hour',
    /** (proposed) */
    resume: 'Resume',
    settings: 'Settings',
    /** (proposed) {time} is filled in on the phone. */
    paused: 'Paused until {time}',
    /** (proposed) */
    locked: 'Locked. Open Aster to listen.',
    heardTitle: 'Hey Aster',
    /** (proposed) */
    heardBody: 'Tap to talk to Aster.',
  },
  /** V5: 5.1's Voice section (canvas) and the "Voice and speech" screen (proposed). */
  settings: {
    section: 'Voice',
    wakeWord: 'Wake word “Hey Aster”',
    wakeWordDetail: 'At home, even with the screen off',
    /** (proposed) A build without the "hey aster" model. */
    wakeWordMissing: 'Not in this version of Aster yet',
    /** (proposed) The switch is on but the microphone isn't allowed. */
    wakeWordNoMic: 'Needs the microphone to listen',
    /** (proposed) */
    allowMic: 'Allow the microphone',
    voiceAndSpeech: 'Voice and speech',
    /** "Device voice · 1.0× · recognition on this phone" (canvas). */
    summary: (voice: string, rate: number, recognition: string) =>
      `${voice} · ${speed(rate)} · ${recognition}`,
    deviceVoice: 'Device voice',
    recognitionHere: 'recognition on this phone',
    /** (proposed) */
    recognitionGoogle: 'recognition by Google',
    /** (proposed) */
    recognitionNone: 'no speech recognition',
    // The screen (all proposed).
    voiceLabel: 'Voice',
    /** The phone's default voice, first in the list. */
    phoneDefault: 'Phone default',
    /** "English (India) 2": a voice of the phone, numbered within its language. */
    voiceName: (language: string, n: number) => `${language} ${n}`,
    languages: {
      'en-IN': 'English (India)',
      'en-US': 'English (US)',
      'en-GB': 'English (UK)',
      'en-AU': 'English (Australia)',
      'hi-IN': 'Hindi',
    } as Record<string, string>,
    otherEnglish: (region: string) => `English (${region})`,
    noVoices: 'Only the phone’s default voice is installed.',
    speedLabel: 'Speed',
    speed,
    test: 'Test',
    testSentence: 'Hi, I’m Aster. This is how I sound.',
    recognitionLabel: 'Recognition',
    recognitionHereFull: 'Recognition: on this phone',
    recognitionGoogleFull: 'Recognition: Google',
    recognitionNoneFull: 'Speech recognition isn’t available on this phone.',
  },
  /** Laravel's activity log after a read-out: counts, never the text. (proposed) */
  activity: {
    readOut: (count: number, name: string | null) =>
      `Read out ${count} missed ${count === 1 ? 'message' : 'messages'}${name ? ` from ${name}` : ''}`,
  },
  /** The reminder card's TalkBack name. */
  reminderCard: (title: string, when: string) => `Reminder: ${title}, ${when}`,
} as const;
