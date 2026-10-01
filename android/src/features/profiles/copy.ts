// 2.1 Who's using, 2.2 Unlock (profile mode) and 2.5 Guest text (docs/aster-home-chat-plan.md §4).
// Canvas strings are exact; the rest are marked (proposed).
import type { ProfileRole } from '@/services/api';

export const whoIsUsing = {
  title: "Who's using Aster?",
  subtitle: 'Each profile has its own locked chats.',
  roles: {
    owner: 'Owner',
    member: 'Member',
    restricted: 'Restricted', // (proposed)
    guest: 'Guest',
  } satisfies Record<ProfileRole, string>,
  guest: 'Guest',
  guestNote: 'Nothing is saved',
  /** TalkBack: "Owner, locked" etc. (proposed) */
  lockedHint: 'Locked. Opens with a PIN.',
  guestHint: "Opens a chat that isn't saved.", // (proposed)
  loadFailed: "Can't load profiles. Showing the last list this phone saw.", // (proposed)
  noProfiles: "Can't load profiles. Check your connection and try again.", // (proposed)
  retry: 'Try again', // (proposed)
} as const;

export const guest = {
  title: 'Guest session',
  subtitle: 'Nothing is saved',
  end: 'End',
  callout:
    'No history and no memory. Messages, reminders and other profiles are hidden in Guest mode.',
  placeholder: 'Ask anything',
  opening: 'Opening a Guest session…', // (proposed)
  failed: "Can't open a Guest session. Check your connection and try again.", // (proposed)
} as const;

/** 2.3 Profiles (docs/aster-profiles-memory-plan.md §4). Canvas strings unless marked. */
export const profilesScreen = {
  title: 'Profiles',
  intro: 'Only the Owner can add, change or remove profiles.',
  you: 'you',
  /** The Owner's line; "fingerprint" only when it is on for this phone. */
  ownerDetail: (fingerprint: boolean) =>
    fingerprint ? 'PIN + fingerprint · Reads phone messages' : 'PIN · Reads phone messages', // second (proposed)
  /** Member and Restricted: "PIN · Chat · History kept". Voice isn't built, so no "and voice". */
  detail: (parts: { chat?: boolean; history?: boolean }) =>
    [
      'PIN',
      parts.chat === undefined ? null : parts.chat ? 'Chat' : 'No chat', // (proposed)
      parts.history === undefined ? null : parts.history ? 'History kept' : 'No history', // "No history" (proposed)
    ]
      .filter(Boolean)
      .join(' · '),
  guestDetail: 'No PIN · Chat only · Wiped when it ends',
  allowGuest: 'Allow guest sessions',
  add: 'Add a profile',
  privacy: 'How profiles stay private',
  privacyLines: [
    'Chats and reminders are saved under each profile on your server, and open only with its PIN.',
    'Memory stays on your home computer, in a separate folder for each profile.',
    "Only the Owner can read this phone's messages and see its location history.",
  ],
  autoLock: (minutes: number) =>
    `Aster locks after ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} in the background and asks again.`,
  /** When the Owner's "Lock when I leave" is off. (proposed) */
  noAutoLock: 'Aster locks when you tap Lock, and asks again.',
  offline: "Can't reach your server. Showing the last list this phone saw.", // (proposed)
  saveFailed: "Couldn't save. Check your connection and try again.", // (proposed)
} as const;
