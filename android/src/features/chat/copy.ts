// 3.3 Chats and 3.4 / 3.5 Chat text (docs/aster-home-chat-plan.md §4.6, §4.7, §6).
// Canvas strings are exact; the rest are marked (proposed).

export const chats = {
  title: 'Chats',
  search: 'Search chats',
  closeSearch: 'Close search', // (proposed)
  searchPlaceholder: 'Search chats', // (proposed)
  newChat: 'New chat',
  privacy: (name: string) => `Only in ${name}'s profile · saved to your server`,
  privateTitle: 'Start a private chat',
  privateNote: 'Not saved and not remembered',
  groups: { today: 'Today', week: 'This week', earlier: 'Earlier' },
  empty: 'No chats yet. Ask Aster anything from Home.', // (proposed)
  noMatch: (query: string) => `No chat matches “${query}”.`, // (proposed)
  delete: 'Delete chat', // (proposed)
  deleteConfirm: 'Delete this chat on every device?', // (proposed)
  cancel: 'Cancel', // (proposed)
  waitingUpload: 'Not on your server yet', // (proposed)
} as const;

export const chat = {
  back: 'Back',
  moreOptions: 'More options',
  subtitle: (model: string) => `${model} · home server`,
  today: 'Today',
  placeholder: 'Message Aster',
  send: 'Send',
  stop: 'Stop', // (proposed)
  webLabel: (on: boolean) => (on ? 'Web: Auto' : 'Web: Off'),
  webA11y: (label: string) => `Web lookups: ${label}`,
  privateBanner: 'Private chat: not saved and not remembered', // (proposed)
  newTitle: 'New chat', // (proposed)
  privateTitle: 'Private chat', // (proposed)
  status: {
    searching: 'Searching the web',
    recalled: (n: number) => `Used ${n} ${n === 1 ? 'memory' : 'memories'}`,
    tool: (tool: string) => `Using ${tool.replace(/_/g, ' ')}`, // (proposed)
    waiting: 'Waiting for the model', // (proposed)
    thinking: 'Thinking…', // (proposed)
  },
  searched: (n: number) => `Searched the web · ${n} ${n === 1 ? 'result' : 'results'}`,
  live: 'Live answer, so it isn’t saved to memory',
  good: 'Good answer',
  bad: 'Bad answer',
  ratedGood: 'Rated good · ranks higher next time',
  ratedBad: 'Rated bad · won’t be recalled',
  continue: 'Continue', // (proposed)
  stopped: 'Stopped.', // (proposed)
  source: (n: number, title: string) => `Source ${n}: ${title}`, // (proposed, TalkBack)
  unavailable: {
    away: 'Chat is available at home',
    loading: 'Model is loading', // (spec)
    noServer: 'Home server not answering', // (spec)
    failed: "The home model didn't load", // (proposed)
    checking: 'Checking the home server…', // (proposed)
  },
  errors: {
    /** Profiles plan B4: the Owner turned chat off on 2.4. (proposed) */
    chatOff: 'The Owner has turned chat off for your profile.',
    noReply: 'Home server not answering. Try again when it’s back.', // (proposed)
    loading: 'Model is loading. Try again in a moment.', // (proposed)
    quota: (name: string) => `${name} is out of quota for now. Switch to Local in Settings.`, // (proposed)
    upstream: (name: string) => `${name} couldn’t answer. Try again.`, // (proposed)
    signedOut: 'Your session ended. Unlock again to keep chatting.', // (proposed)
    generic: 'Something went wrong. Try again.', // (proposed)
  },
} as const;
