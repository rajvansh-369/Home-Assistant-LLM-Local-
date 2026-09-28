// Messages and spoken alerts: 3.1 / 3.2 cards, 4.1 Messages, 4.2 Thread, 4.3 Spoken alerts, the VIP
// editor, 4.4 notifications, and what the native alert engine says and shows
// (docs/aster-messages-alerts-plan.md §3, §5). Canvas strings are exact; the rest are marked.
import type { MessageSource, SpeakMode } from '@/services/api';

export const sources: Record<MessageSource, string> = {
  whatsapp: 'WhatsApp',
  google_chat: 'Google Chat',
  sms: 'SMS',
};

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export const messages = {
  tab: 'Messages',
  title: 'Messages',
  /** The filter chips' order and labels. */
  filters: [
    { id: 'all', label: 'All' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'sms', label: 'SMS' },
    { id: 'google_chat', label: 'Google Chat' },
  ] as const,
  filterLabel: (label: string, unread: number) =>
    unread > 0 ? `${label}, ${unread} unread` : label, // (proposed; TalkBack)
  catchUp: {
    title: 'Catch-up',
    counts: (unread: number, chats: number) =>
      `${unread} unread · ${chats} ${plural(chats, 'chat', 'chats')}`,
    readAloud: 'Read aloud',
    askAbout: 'Ask about it',
    needsHome: 'Summaries need your home server.', // (proposed)
    writing: 'Catching up…', // (proposed)
    failed: 'Couldn’t write a catch-up.', // (proposed)
    tryAgain: 'Try again', // (proposed)
    allCaughtUp: 'You’re all caught up.', // (proposed)
  },
  vip: 'VIP',
  everyoneElse: 'Everyone else',
  readAloudAt: (time: string) => `Read aloud at ${time}`,
  otpHidden: 'One-time code hidden · tap to show',
  footnote:
    'Aster sees messages from the moment notification access is on. Older chat history isn’t available.',
  accessOff: 'Notification access is off, so Aster can’t see new messages.', // (proposed)
  allow: 'Allow',
  empty: 'No messages yet. New WhatsApp, Google Chat and SMS messages show up here.', // (proposed)
  /** TalkBack for a thread row. (proposed) */
  rowLabel: (title: string, source: string, time: string, unread: number) =>
    `${title}, ${source}, ${time}${unread > 0 ? `, ${unread} unread` : ''}`,
  noName: 'Unknown sender', // (proposed)
} as const;

export const thread = {
  back: 'Back',
  subtitle: (source: string, vip: boolean) => (vip ? `${source} · VIP` : source),
  vipButton: 'VIP contact',
  today: 'Today',
  readAloudMarker: (time: string) => `Aster read these aloud at ${time}`,
  aster: 'Aster',
  suggested: 'suggested reply',
  yourReply: 'Your reply',
  rewrite: 'Rewrite',
  rewrites: [
    { id: 'shorter', label: 'Shorter' },
    { id: 'warmer', label: 'Warmer' },
    { id: 'hinglish', label: 'Hinglish' },
  ] as const,
  send: (source: string) => `Send via ${source}`,
  sent: (source: string, time: string) => `Sent through ${source} at ${time}`,
  footnote: (source: string) =>
    `Sends through the ${source} notification’s Reply action. Nothing goes out until you tap Send.`,
  drafting: 'Drafting a reply…', // (proposed)
  draftFailed: 'Couldn’t draft a reply.', // (proposed)
  tryAgain: 'Try again', // (proposed)
  needsHome: 'Suggestions need your home server.', // (proposed)
  gone: (source: string) => `The ${source} notification is gone, so Aster can’t reply from here.`, // (proposed)
  open: (source: string) => `Open ${source}`, // (proposed)
  sendFailed: 'Couldn’t send. Try again.', // (proposed)
  vipSaveFailed: 'Couldn’t change the VIP list. Try again.', // (proposed)
} as const;

/** 3.1 and 3.2 (Owner only). */
export const home = {
  listening: (vips: number) => `Listening · ${vips} ${plural(vips, 'VIP', 'VIPs')}`,
  missedTitle: 'Missed while you were away',
  readAloud: 'Read aloud',
  summarize: 'Summarize',
  awayTitle: (count: number) => `${count} ${plural(count, 'message', 'messages')} from VIPs`,
  awayBody: 'Aster will offer a catch-up when you get home',
  openMessages: 'Open messages',
} as const;

const speakModes: { value: SpeakMode; label: string }[] = [
  { value: 'full', label: 'Full message' },
  { value: 'summary', label: 'Summary' },
  { value: 'name', label: 'Name only' },
];

/** 4.3 Spoken alerts. */
export const alerts = {
  title: 'Spoken alerts',
  back: 'Back',
  speak: 'Speak missed messages',
  speakDetail: 'Only from your VIP contacts',
  vips: 'VIP contacts',
  addVip: 'Add a VIP contact',
  vipSources: (list: MessageSource[]) => list.map((s) => sources[s]).join(' · '),
  missedAfter: 'Count it as missed after',
  missedChoices: [2, 5, 10, 15],
  minutes: (n: number) => `${n} min`,
  missedHelp: 'If you open the chat before then, Aster stays quiet.',
  says: 'What Aster says',
  speakModes,
  /** The sample line under the choice, with the first VIP's name. */
  sample: (mode: SpeakMode, name: string) =>
    mode === 'name'
      ? `“You missed 2 WhatsApp messages from ${name}.”`
      : mode === 'summary'
        ? `“${name} sent 2 WhatsApp messages. They want a call back and are asking about Sunday.”`
        : `“${name} sent 2 WhatsApp messages. Call me when you’re free. Are you coming on Sunday?”`,
  sampleName: 'Someone', // (proposed)
  summaryNote:
    'Summary needs your home server. Away from home, or while the model is busy, Aster reads the full message.',
  quietHours: 'Quiet hours',
  quietRange: (from: string, to: string) => `${from} to ${to}`,
  quietOff: 'Off', // (proposed)
  from: 'From', // (proposed)
  to: 'To', // (proposed)
  urgent: 'Still speak urgent ones',
  urgentDetail: 'When a VIP writes “urgent” or “call me”',
  /** What "Still speak urgent ones" saves as urgent_keywords (plan decision 8). */
  urgentWords: ['urgent', 'call me'],
  headphones: 'Headphones or car only',
  headphonesDetail: 'Never read messages on the speaker',
  atHome: 'Only speak at home',
  atHomeDetail: 'Away from home, missed messages wait as notifications',
  saveFailed: 'Couldn’t save. Try again.', // (proposed)
} as const;

/** The VIP contact editor. All (proposed): the canvas has only "Add a VIP contact". */
export const vipEditor = {
  newTitle: 'New VIP contact',
  editTitle: 'VIP contact',
  back: 'Back',
  name: 'Name',
  namePlaceholder: 'Mom',
  matchKey: 'Name in notifications',
  matchKeyHelp: 'Exactly as it shows in the app’s notifications, like the contact’s saved name.',
  apps: 'Apps',
  appsHelp: 'Pick at least one.',
  recent: 'From your messages',
  save: 'Save',
  delete: 'Delete',
  deleteConfirm: 'Remove this VIP contact? Aster stops reading their messages aloud.',
  cancel: 'Cancel',
  saveFailed: 'Couldn’t save. Try again.',
} as const;

/** 4.4 notifications posted from JS (plan §3). */
export const notifications = {
  channel: 'Arriving home', // (proposed)
  welcomeTitle: 'Welcome home',
  welcomeBody: (model: string, count: number, names: string[]) =>
    `${model} is ready. You missed ${count} ${plural(count, 'message', 'messages')} from ${joinNames(names)}.`,
  catchMeUp: 'Catch me up',
  later: 'Later',
  serverTitle: 'Home server not answering',
  serverBody: (host: string) =>
    `You’re home, but ${host} isn’t replying. Alerts still read messages out.`,
  retry: 'Retry',
  settings: 'Settings',
} as const;

/** "Mom", "Mom and Arjun", "Mom, Arjun and Neha". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** What Laravel's activity log shows. No message text. (proposed) */
export const activity = {
  replied: (name: string, source: string) => `Replied to ${name} on ${source}`,
  serverProblem: 'Home server not answering',
} as const;

/**
 * What the native alert engine says and shows (plan §5): {name}, {count}, {source}, {messages},
 * {texts} and {summary} are filled in on the phone.
 */
export const spoken = {
  full: '{name} sent {count} {source} {messages}. {texts}',
  name: 'You missed {count} {source} {messages} from {name}.',
  summary: '{name} sent {count} {source} {messages}. {summary}',
  title: '{name} · {count} missed {source} {messages}',
  activity: 'Read out {count} {source} {messages} from {name}', // (proposed)
  message: 'message',
  messages: 'messages',
  sources,
  reply: 'Reply', // (proposed: "Reply by voice" waits for 3.6 Voice)
  remind: 'Remind in 30 min',
  open: 'Open',
  channel: 'Missed messages', // (proposed)
  summaryPrompt:
    'Summarise these messages in one short sentence for someone who missed them. Say only the summary.',
} as const;
