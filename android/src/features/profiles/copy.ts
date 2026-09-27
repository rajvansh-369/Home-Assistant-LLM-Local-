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
