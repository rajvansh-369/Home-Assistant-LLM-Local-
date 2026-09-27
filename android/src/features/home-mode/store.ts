// Home mode's current state, in memory only (docs/aster-home-chat-plan.md §2).
import { create } from 'zustand';

import type { HomeMode } from './mode';

type HomeModeStore = {
  mode: HomeMode;
  /** When `/health` last answered (ms), for the dev facts. */
  checkedAt: number | null;
  set: (patch: Partial<Pick<HomeModeStore, 'mode' | 'checkedAt'>>) => void;
};

export const useHomeModeStore = create<HomeModeStore>()((set) => ({
  mode: { kind: 'away', distanceM: null },
  checkedAt: null,
  set: (patch) => set(patch),
}));
