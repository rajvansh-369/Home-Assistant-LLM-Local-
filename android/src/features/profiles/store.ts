// The household's profiles as `GET /profiles` last listed them, so 2.1 opens without a network.
// Names, colours and roles only: no tokens, nothing secret.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Profile } from '@/services/api/types';

export const PROFILES_STORAGE_KEY = 'aster.profiles';

export type ProfileSummary = Pick<Profile, 'id' | 'name' | 'color' | 'role'>;

type ProfilesStore = {
  profiles: ProfileSummary[];
  set: (patch: { profiles: ProfileSummary[] }) => void;
};

export const useProfilesStore = create<ProfilesStore>()(
  persist(
    (set) => ({
      profiles: [],
      set: (patch) => set(patch),
    }),
    {
      name: PROFILES_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ profiles }) => ({ profiles }),
    },
  ),
);

/** 2.1 order: the Owner, then the others by id, Guest last. */
export function sortProfiles(profiles: ProfileSummary[]): ProfileSummary[] {
  const rank = (p: ProfileSummary) => (p.role === 'owner' ? 0 : p.role === 'guest' ? 2 : 1);
  return [...profiles].sort((a, b) => rank(a) - rank(b) || a.id - b.id);
}
