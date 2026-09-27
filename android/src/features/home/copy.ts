// 3.1 Home, 3.2 Home away, the tab bar and the home-mode status text
// (docs/aster-home-chat-plan.md §4.4, §4.5, §5). Canvas strings are exact; the rest are marked.

export const tabs = {
  home: 'Home',
  chats: 'Chats',
  settings: 'Settings',
  /** The tab bar's TalkBack name. */
  main: 'Main',
} as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const home = {
  /** "Wed, 23 Sep" (canvas), in the phone's time zone. */
  dateLine: (date: Date) =>
    `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`,
  greeting: (hour: number, name: string) => {
    const part =
      hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : 'evening';
    return `Good ${part}, ${name}`;
  },
  switchOrLock: 'Switch profile or lock',
  askAnything: 'Ask Aster anything',
  suggestions: [
    'Plan tomorrow morning',
    'Explain something simply', // (proposed)
    'Help me write a message', // (proposed)
  ],
  loadingBanner: "Model is loading. Chat opens when it's ready.", // (proposed)
  noServerBanner: 'Home server not answering. Trying again every minute.', // (proposed)
  failedBanner: (error: string) => `The model didn't load: ${error}`, // (proposed)
  away: {
    distance: (km: string) => `Away from home · ${km} km`,
    noDistance: 'Away from home', // (proposed)
    /** The canvas also names reminders and message capture, which aren't built yet. (proposed) */
    body: 'Chat switches on when you get home.',
    chatAtHome: 'Chat is available at home',
    mapLabel: (km: string) => `Map showing you ${km} km from home`,
    mapLabelNoDistance: 'Map showing your home area', // (proposed)
  },
} as const;

/** The home-mode chip on 2.1 and 3.1 (§5). */
export const homeStatus = {
  ready: (model: string) => `At home · ${model} ready`,
  readyShort: (model: string) => `At home · ${model}`,
  checking: 'Checking the home server…', // (proposed)
  loading: 'At home · model loading', // (proposed)
  noServer: 'Home server not answering', // (proposed)
  failed: 'Home model failed to load', // (proposed)
  away: 'Away from home', // (proposed)
  noHome: 'No home saved', // (proposed)
} as const;
