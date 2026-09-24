// First-run state (plan §5 "Where things are kept").
// Persisted slice: non-secret facts only, in AsyncStorage. Memory slice: never written anywhere.
// Secrets on disk (device token, biometric PIN) live in src/services/secure.ts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Place } from '@/services/api/types';
import type { ProfileColor } from '@/theme';

import type { FirstRunFacts } from './routing';

export const FIRST_RUN_STORAGE_KEY = 'aster.first-run';

export type OwnerFacts = { id: number; name: string; color: ProfileColor };

export type PersistedFirstRun = {
  serverUrl: string | null;
  /** For prefill only. */
  email: string | null;
  owner: OwnerFacts | null;
  home: Omit<Place, 'name'> | null;
  fingerprintEnabled: boolean;
  lockWhenLeave: boolean;
  permissionsDone: boolean;
  firstRunDone: boolean;
};

export type Session = { profileToken: string; llmToken: string; expiresAt: string };

export type MemoryFirstRun = {
  /** Persisted slice loaded and device token checked. */
  booted: boolean;
  hasDeviceToken: boolean;
  /** Register mode: carried from 1.2 to 1.3, where the account is created. */
  pendingRegistration: { email: string; password: string } | null;
  session: Session | null;
  /** 2.2 prefill for 1.4, from GET /places/home. */
  homePrefill: Place | null;
  /** One-off message for 1.2, e.g. after a 401 or when the household already exists. */
  signInNotice: string | null;
  /** 1.3 sent the user back to 1.2 (register failed): mode and field error to show there. */
  signInReturn: SignInReturn | null;
};

export type SignInReturn = {
  mode: 'register' | 'signIn';
  field?: 'email' | 'password';
  message?: string;
};

type Actions = {
  set: (patch: Partial<PersistedFirstRun & MemoryFirstRun>) => void;
  /** Back to a fresh install (secure store and mock server are cleared by the caller). */
  resetAll: () => void;
};

export type FirstRunStore = PersistedFirstRun & MemoryFirstRun & Actions;

export const initialPersisted: PersistedFirstRun = {
  serverUrl: null,
  email: null,
  owner: null,
  home: null,
  fingerprintEnabled: true,
  lockWhenLeave: true,
  permissionsDone: false,
  firstRunDone: false,
};

const initialMemory: MemoryFirstRun = {
  booted: false,
  hasDeviceToken: false,
  pendingRegistration: null,
  session: null,
  homePrefill: null,
  signInNotice: null,
  signInReturn: null,
};

const persistedKeys = Object.keys(initialPersisted) as (keyof PersistedFirstRun)[];

/** Only the keys in PersistedFirstRun ever reach AsyncStorage. */
export function pickPersisted(state: FirstRunStore): PersistedFirstRun {
  const picked = {} as Record<string, unknown>;
  for (const key of persistedKeys) picked[key] = state[key];
  return picked as PersistedFirstRun;
}

export const useFirstRunStore = create<FirstRunStore>()(
  persist(
    (set) => ({
      ...initialPersisted,
      ...initialMemory,
      set: (patch) => set(patch),
      resetAll: () => set({ ...initialPersisted, ...initialMemory, booted: true }),
    }),
    {
      name: FIRST_RUN_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: pickPersisted,
      skipHydration: true,
    },
  ),
);

export function isUnlocked(session: Session | null, now = Date.now()): boolean {
  return session != null && Date.parse(session.expiresAt) > now;
}

export function firstRunFacts(state: FirstRunStore): FirstRunFacts {
  return {
    firstRunDone: state.firstRunDone,
    hasDeviceToken: state.hasDeviceToken,
    serverEntered: state.serverUrl != null,
    hasOwner: state.owner != null,
    homeSaved: state.home != null,
    unlocked: isUnlocked(state.session),
    permissionsDone: state.permissionsDone,
  };
}
