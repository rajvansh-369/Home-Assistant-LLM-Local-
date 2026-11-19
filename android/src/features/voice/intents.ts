// Things Aster does by voice (docs/aster-voice-plan.md §5), parsed on the phone: the model can't
// make reminders or send messages. Pure rules, no I/O: the voice turn decides what each one does
// (and whether this profile may), and anything that isn't one of these goes to the chat.
import type { ReminderTrigger } from '@/services/api/types';

export type VoiceIntent =
  | { kind: 'stop' }
  /** "Send" / "Yes": only means something while a reply waits for confirmation. */
  | { kind: 'confirm' }
  /** "No" / "Not now": the same. */
  | { kind: 'decline' }
  /** `trigger` null: "Remind me to X" said no when. */
  | { kind: 'reminder'; title: string; trigger: ReminderTrigger | null; dueAt: Date | null }
  | { kind: 'read'; name: string | null }
  /** Only an intent while there is a chat to reply to (after a read-out or Reply by voice). */
  | { kind: 'reply'; text: string };

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  'forty five': 45,
  'forty-five': 45,
  fifty: 50,
};

/** Lower case, single spaces, no wake word or "please" in front, no end punctuation. */
export function normalize(said: string): string {
  return said
    .toLowerCase()
    .replace(/[“”"]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:hey |ok |okay )?aster,?\s+)/, '')
    .replace(/^(?:please|ok|okay|so|and),?\s+/, '')
    .replace(/[\s.!?,]+$/, '')
    .replace(/,?\s+please$/, '')
    .replace(/,/g, '');
}

function count(word: string): number | null {
  if (/^\d+$/.test(word)) return Number(word);
  return NUMBER_WORDS[word] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Times

const AT_MOST_HOURS = 24 * 7;

type ClockTime = { hour: number; minute: number; meridiem: 'am' | 'pm' | null };

const MERIDIEM = String.raw`(a\.?\s?m\.?|p\.?\s?m\.?)`;
const HOUR_WORD = Object.keys(NUMBER_WORDS)
  .filter((w) => NUMBER_WORDS[w] <= 12 && w !== 'a' && w !== 'an')
  .join('|');
/** "9", "9:30", "9 30", "9.30 pm", "21:00", "nine", "nine pm", "noon", "midnight". */
const CLOCK = String.raw`(noon|midnight|(?:\d{1,2}(?:[:.]\d{2}|\s\d{2})?|${HOUR_WORD})(?:\s?${MERIDIEM}|\so'?clock)?)`;

function parseClock(text: string): ClockTime | null {
  if (text === 'noon') return { hour: 12, minute: 0, meridiem: 'pm' };
  if (text === 'midnight') return { hour: 0, minute: 0, meridiem: 'am' };
  const match = new RegExp(
    String.raw`^(\d{1,2}|${HOUR_WORD})(?:[:.\s](\d{2}))?(?:\s?${MERIDIEM}|\so'?clock)?$`,
  ).exec(text);
  if (!match) return null;
  const hour = count(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour == null || hour > 23 || minute > 59) return null;
  const meridiem = match[3] ? (match[3].startsWith('a') ? 'am' : 'pm') : null;
  if (meridiem && (hour === 0 || hour > 12)) return null;
  return { hour, minute, meridiem };
}

function at(day: Date, hour24: number, minute: number): Date {
  const date = new Date(day);
  date.setHours(hour24, minute, 0, 0);
  return date;
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const to24 = (hour: number, meridiem: 'am' | 'pm') =>
  meridiem === 'am' ? hour % 12 : (hour % 12) + 12;

/**
 * When a spoken clock time is (plan §5, proposed rule): "9" is the next 9:00, AM if that is still
 * ahead today, else PM, else tomorrow morning. "9 PM" / "21:00" are today, or tomorrow once past.
 * `day`: "tomorrow" (an hour without AM/PM is 7–11 AM, else 12–6 PM) or "tonight" (PM).
 */
export function resolveClock(
  time: ClockTime,
  now: Date,
  day: 'tomorrow' | 'tonight' | null = null,
): Date {
  const { hour, minute, meridiem } = time;
  if (day === 'tomorrow') {
    const tomorrow = addDays(now, 1);
    if (meridiem) return at(tomorrow, to24(hour, meridiem), minute);
    if (hour > 12) return at(tomorrow, hour, minute);
    return at(tomorrow, hour >= 7 && hour <= 11 ? hour : to24(hour, 'pm'), minute);
  }
  const fixed = meridiem
    ? to24(hour, meridiem)
    : hour > 12 || hour === 0
      ? hour
      : day === 'tonight'
        ? to24(hour, 'pm')
        : null;
  if (fixed != null) {
    const today = at(now, fixed, minute);
    return today > now ? today : addDays(today, 1);
  }
  const morning = at(now, hour % 12, minute);
  if (morning > now) return morning;
  const evening = at(now, (hour % 12) + 12, minute);
  if (evening > now) return evening;
  return addDays(morning, 1);
}

type When = { trigger: ReminderTrigger; dueAt: Date | null };

const HOME = String.raw`when i(?:'m| am| get| reach| come| arrive) (?:back )?(?:home|at home)`;
const IN = String.raw`in (\d+|${Object.keys(NUMBER_WORDS).join('|')}|half an|half a) ?(minutes?|mins?|hours?|hrs?)`;

/** The "when" part of a reminder, said alone. */
function parseWhen(text: string, now: Date): When | null {
  if (new RegExp(`^${HOME}$`).test(text)) return { trigger: 'arrive_home', dueAt: null };

  const inMatch = new RegExp(`^${IN}$`).exec(text);
  if (inMatch) {
    const half = inMatch[1].startsWith('half');
    const n = half ? 0.5 : count(inMatch[1]);
    const hours = inMatch[2].startsWith('h');
    if (n == null || n <= 0) return null;
    if (half && !hours) return null;
    const ms = n * (hours ? HOUR_MS : MINUTE_MS);
    if (ms > AT_MOST_HOURS * HOUR_MS) return null;
    return { trigger: 'time', dueAt: new Date(now.getTime() + ms) };
  }

  const dayFirst = new RegExp(`^(tomorrow|tonight)(?: at)? ${CLOCK}$`).exec(text);
  const dayLast = new RegExp(`^(?:at )?${CLOCK} (tomorrow|tonight)$`).exec(text);
  const plain = new RegExp(`^at ${CLOCK}$`).exec(text);
  const [day, clock] = dayFirst
    ? [dayFirst[1], dayFirst[2]]
    : dayLast
      ? [dayLast[dayLast.length - 1], dayLast[1]]
      : plain
        ? [null, plain[1]]
        : [null, null];
  if (clock == null) {
    if (text === 'tomorrow morning') return { trigger: 'time', dueAt: resolveClock({ hour: 9, minute: 0, meridiem: 'am' }, now, 'tomorrow') };
    if (text === 'tonight') return { trigger: 'time', dueAt: resolveClock({ hour: 9, minute: 0, meridiem: 'pm' }, now) };
    return null;
  }
  const time = parseClock(clock);
  if (!time) return null;
  return {
    trigger: 'time',
    dueAt: resolveClock(time, now, day as 'tomorrow' | 'tonight' | null),
  };
}

/** "call mom at 9" → title "call mom", when at 9; the when may also come first ("at 9 to …"). */
function splitReminder(rest: string, now: Date): { title: string; when: When | null } {
  // When first: "remind me at 9 to call mom", "remind me when I get home to water the plants".
  const first = /^(.+?) to (.+)$/.exec(rest);
  if (first) {
    const when = parseWhen(first[1], now);
    if (when) return { title: first[2], when };
  }
  // When last: the longest ending of up to 6 words that parses.
  const words = rest.replace(/^to /, '').split(' ');
  for (let n = Math.min(6, words.length - 1); n >= 1; n -= 1) {
    const when = parseWhen(words.slice(-n).join(' '), now);
    if (when) return { title: words.slice(0, -n).join(' '), when };
  }
  return { title: rest.replace(/^to /, ''), when: null };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * "to call mom" / "that I need to call mom" → "Call Mom": the words as the recognizer wrote them
 * (names keep their capitals), the first letter capital.
 */
function tidyTitle(title: string, said: string): string {
  const words = title.replace(/^(?:to |that i (?:need to |have to |should )?)/, '').trim();
  const from = said.toLowerCase().replace(/[’‘]/g, "'").indexOf(words);
  return capitalize(from >= 0 ? said.slice(from, from + words.length) : words);
}

// ---------------------------------------------------------------------------------------------

const STOP = /^(?:stop|stop it|stop talking|cancel|never ?mind|forget it|that's all|that's it|nothing|bye|goodbye|shut up|be quiet)$/;
const CONFIRM = /^(?:yes|yeah|yep|yup|sure|haan|ha|send|send it|yes send( it)?|ok send( it)?|okay send( it)?|go ahead|do it)$/;
const DECLINE = /^(?:no|nope|nah|not now|don't send( it)?|dont send( it)?|do not send( it)?|leave it|skip( it)?)$/;
const READ = new RegExp(
  String.raw`^(?:(?:can you |could you )?(?:read|play|tell me)(?: out| me| aloud)?(?: all)?(?: my| the)?(?: (?:missed|unread|new|latest))? messages(?: from (.+?))?(?: aloud| out)?` +
    String.raw`|(?:do i have|are there|any)(?: any)? (?:new |missed |unread )?messages(?: from (.+?))?` +
    String.raw`|what did (.+?) (?:say|send|write)(?: to me)?` +
    String.raw`|read (.+?)'s messages)$`,
);
const REPLY = /^(?:reply|say|tell (?:her|him|them)|send|write back|answer)(?: to (?:her|him|them))?(?: that)?,?\s+(.+)$/;
const REPLY_PREFIX =
  /^(?:reply|say|tell (?:her|him|them)|send|write back|answer)(?: to (?:her|him|them))?(?: that)?,?\s+/i;
const REMIND = /^(?:(?:can you |could you |please )?remind me|set a reminder|add a reminder|create a reminder)(?: to)?\s+(.+)$/;

/** What was said, as one of §5's intents; null means it is a question for the chat. */
export function parseIntent(said: string, now = new Date()): VoiceIntent | null {
  const text = normalize(said);
  if (!text) return null;
  if (STOP.test(text)) return { kind: 'stop' };
  if (CONFIRM.test(text)) return { kind: 'confirm' };
  if (DECLINE.test(text)) return { kind: 'decline' };

  const remind = REMIND.exec(text);
  if (remind) {
    const { title, when } = splitReminder(remind[1], now);
    const tidy = tidyTitle(title, said);
    if (!tidy) return null;
    return { kind: 'reminder', title: tidy, trigger: when?.trigger ?? null, dueAt: when?.dueAt ?? null };
  }

  const read = READ.exec(text);
  if (read) {
    const name = read.slice(1).find((part) => part != null) ?? null;
    return { kind: 'read', name: name ? name.trim() : null };
  }

  const reply = REPLY.exec(text);
  if (reply) {
    // The reply as it was said (case, punctuation), only without the "Reply …" in front.
    const body = said
      .trim()
      .replace(/^(?:(?:hey |ok |okay )?aster,?\s+)/i, '')
      .replace(/^(?:please|ok|okay|so|and),?\s+/i, '')
      .replace(REPLY_PREFIX, '')
      .replace(/^[“"']+|[”"']+$/g, '')
      .trim();
    if (!body) return null;
    return { kind: 'reply', text: capitalize(body) };
  }
  return null;
}

/** A thread's people that a spoken name matches: the VIP's name, the chat's title, a sender. */
export function nameMatches(spoken: string, candidates: (string | null | undefined)[]): boolean {
  const want = spoken
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/^(?:my |the )/, '')
    .trim();
  if (!want) return false;
  return candidates.some((candidate) => {
    if (!candidate) return false;
    const have = candidate.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (have === want) return true;
    const words = have.split(' ');
    return want.split(' ').every((part) => words.includes(part));
  });
}
