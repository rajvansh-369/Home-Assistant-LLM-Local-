// 5.1 Settings text. All (proposed): the canvas draws 5.1, but not the Assistant section.
import type { LlmEngine } from '@/services/api';

export const settings = {
  title: 'Settings',
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
} as const;
