// 5.1 Settings text. All (proposed): the canvas draws 5.1, but not the Assistant section.
import type { LlmEngine } from '@/services/api';

export const settings = {
  title: 'Settings',
  profile: 'Profile',
  lock: 'Lock',
  assistant: 'Assistant',
  assistantHelp: 'Who answers your chats. Switch any time; it applies to your next message.',
  engines: {
    local: {
      tag: 'Offline',
      description: 'Runs on your home computer. Answers even when the internet is down.',
    },
    markl: {
      tag: 'Online',
      description: 'Google Gemini, reached through your home computer. Needs the internet.',
    },
  } satisfies Record<LlmEngine, { tag: string; description: string }>,
  saved: 'Saved.',
  pending: 'Saved on this phone. It reaches your other devices the next time you unlock.',
  homeWifi: 'Both answer through your home computer, so chat needs your home Wi-Fi.',
  /** Owner only (docs/aster-messages-alerts-plan.md §3 5.1). Canvas strings. */
  alertsSection: 'Alerts and background',
  spokenAlerts: 'Spoken alerts',
  spokenDetail: (vips: number, minutes: number) =>
    `${vips} VIP ${vips === 1 ? 'contact' : 'contacts'} · missed after ${minutes} min`,
  spokenOff: 'Off', // (proposed)
  background: 'Run in background',
  unrestricted: 'Battery usage: Unrestricted',
  optimized: 'Battery usage: Optimized', // (proposed)
  privacy: 'Privacy',
  /** Owner only; the count is every profile, Guest included, as drawn. */
  profiles: 'Profiles',
  hideText: 'Hide message text on lock screen',
  /** Every profile but Guest. */
  memory: 'Memory and activity',
  autoLock: 'Auto-lock',
  autoLockOn: 'After 2 min',
  autoLockOff: 'Off', // (proposed)
  cancel: 'Cancel', // (proposed)
  yourData: 'Your data',
  deleteChats: (name: string) => `Delete all of ${name}’s chats`,
  deleteChatsConfirm:
    'Every chat of this profile is deleted from your server and this phone. Memory on your home computer stays.', // (proposed)
  deleteChatsDone: 'Your chats are deleted.', // (proposed)
  deleteChatsOld: 'Your server needs an update before chats can be deleted all at once.', // (proposed)
  saveFailed: "Couldn't save. Check your connection and try again.", // (proposed)
} as const;
