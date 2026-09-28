// Captured threads (docs/aster-messages-alerts-plan.md §2 JS): the native message store as a zustand
// store. It refreshes when the native side says messages changed and when the app comes back to the
// foreground, which also re-reads whether notification access is on. Messages never leave the phone
// from here and are never logged.
import { AppState } from 'react-native';
import { create } from 'zustand';

import AsterSystem, { type CapturedThread } from '../../../modules/aster-system';

type ThreadsStore = {
  threads: CapturedThread[];
  loaded: boolean;
  /** Notification access is on, so new messages are being captured. */
  listening: boolean;
  set: (patch: Partial<Omit<ThreadsStore, 'set'>>) => void;
};

export const useThreadsStore = create<ThreadsStore>()((set) => ({
  threads: [],
  loaded: false,
  listening: false,
  set: (patch) => set(patch),
}));

const store = () => useThreadsStore.getState();

export const unreadCount = (thread: CapturedThread) => thread.unreadSenders.length;

let running: Promise<void> | null = null;
let again = false;

/** Reads the threads again (or once more right after a read in progress). Never throws. */
export function refreshThreads(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const threads = await AsterSystem.listThreads().catch(() => store().threads);
        store().set({
          threads,
          loaded: true,
          listening: AsterSystem.isNotificationListenerEnabled(),
        });
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** 4.2 opened the thread: read at once on screen, and on the native side. */
export async function markThreadRead(key: string): Promise<void> {
  store().set({
    threads: store().threads.map((thread) =>
      thread.key === key ? { ...thread, unreadSenders: [] } : thread,
    ),
  });
  await AsterSystem.markThreadSeen(key).catch(() => {});
}

let installed = false;

/** Called once from the messages installer. */
export function installThreads() {
  if (installed) return;
  installed = true;
  AsterSystem.addListener('onMessagesChanged', () => void refreshThreads());
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void refreshThreads();
  });
  void refreshThreads();
}

/** Sign-out and reset: the captured messages leave the phone. */
export async function clearThreads() {
  await AsterSystem.clearMessages().catch(() => {});
  store().set({ threads: [] });
}

/** Tests only. */
export function resetThreadsRuntime() {
  installed = false;
  running = null;
  again = false;
  store().set({ threads: [], loaded: false, listening: false });
}
