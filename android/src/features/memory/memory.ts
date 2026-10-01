// 5.2 Memory and activity (docs/aster-profiles-memory-plan.md §4 5.2): the unlocked profile's
// memory on the home PC (notes and learned answers, at home only) and its activity log on Laravel
// (anywhere). Memory only: notes are the profile's own words and never touch the phone's storage
// or the log.
import { create } from 'zustand';

import { activeEngine } from '@/features/chat/ask';
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { useHomeModeStore } from '@/features/home-mode/store';
import { api, ApiError, type Activity } from '@/services/api';
import {
  addNote,
  forgetAll,
  forgetRecord,
  listNotes,
  MemoryError,
  memoryOverview,
  type MemoryAccess,
  type MemoryNote,
  type MemoryOverview,
} from '@/services/llm/memory';

/**
 * - `away`: not at home with the model ready, so memory can't be reached.
 * - `off`: the profile's memory is off (zypherLL answers 403).
 * - `failed`: the home PC didn't answer as expected.
 */
export type MemoryState = 'idle' | 'loading' | 'ready' | 'away' | 'off' | 'failed';

type Store = {
  state: MemoryState;
  overview: MemoryOverview | null;
  notes: MemoryNote[];
  activity: Activity[];
  /** null until the first load; false when Laravel couldn't send the log. */
  activityLoaded: boolean | null;
  /** False when Laravel has no `DELETE /activity` yet (B5): "Clear log" is hidden. */
  canClearLog: boolean;
  set: (patch: Partial<Omit<Store, 'set'>>) => void;
};

const initial = {
  state: 'idle' as MemoryState,
  overview: null,
  notes: [],
  activity: [],
  activityLoaded: null,
  canClearLog: true,
};

export const useMemoryStore = create<Store>()((set) => ({
  ...initial,
  set: (patch) => set(patch),
}));

const store = () => useMemoryStore.getState();
const firstRun = () => useFirstRunStore.getState();

/** Leaving 5.2 or locking: the notes go from memory. */
export function forgetMemoryScreen() {
  store().set(initial);
}

function session() {
  const { session, serverUrl } = firstRun();
  if (!serverUrl || !isUnlocked(session) || session!.profile.role === 'guest') return null;
  return { server: serverUrl, session: session! };
}

/** The llm_token and home LLM for the profile's engine, at home with the model ready only. */
function access(): MemoryAccess | null {
  const { session, home } = firstRun();
  if (useHomeModeStore.getState().mode.kind !== 'ready') return null;
  if (!session?.llmToken || !home) return null;
  return { llmUrl: home.llm_url, llmToken: session.llmToken, engine: activeEngine() };
}

/** A fresh llm_token from Laravel (after a 401, or when the `memory` claim must change). */
async function refreshToken(): Promise<boolean> {
  const current = session();
  if (!current) return false;
  try {
    const fresh = await api.refreshLlmToken(current.server, current.session.profileToken);
    const now = firstRun().session;
    if (now?.profileToken === current.session.profileToken) {
      firstRun().set({ session: { ...now, llmToken: fresh.llm_token } });
    }
    return true;
  } catch {
    return false;
  }
}

/** Runs a memory call; a 401 gets a fresh llm_token and one retry. */
async function withAccess<T>(call: (access: MemoryAccess) => Promise<T>): Promise<T> {
  const first = access();
  if (!first) throw new MemoryError('no-reply', 'Not at home.');
  try {
    return await call(first);
  } catch (error) {
    if (!(error instanceof MemoryError) || error.kind !== 'unauthorized') throw error;
    if (!(await refreshToken())) throw error;
    const again = access();
    if (!again) throw error;
    return call(again);
  }
}

function stateFor(error: unknown): MemoryState {
  return error instanceof MemoryError && error.kind === 'off' ? 'off' : 'failed';
}

/** 5.2 opening, and Try again: the overview and the notes. */
export async function refreshMemory(): Promise<MemoryState> {
  if (!access()) {
    store().set({ state: 'away', overview: null, notes: [] });
    return 'away';
  }
  store().set({ state: store().state === 'ready' ? 'ready' : 'loading' });
  try {
    const [overview, notes] = await withAccess((a) =>
      Promise.all([memoryOverview(a), listNotes(a)]),
    );
    store().set({ state: 'ready', overview, notes });
    return 'ready';
  } catch (error) {
    const state = stateFor(error);
    store().set({ state, overview: null, notes: [] });
    return state;
  }
}

/** "Forget this": gone from the list at once, back if the home PC refuses. */
export async function forgetNote(id: number): Promise<boolean> {
  const before = store().notes;
  store().set({ notes: before.filter((note) => note.id !== id) });
  try {
    await withAccess((a) => forgetRecord(a, id));
  } catch (error) {
    // Already gone is what was asked for.
    if (!(error instanceof MemoryError && error.kind === 'not-found')) {
      store().set({ notes: before });
      return false;
    }
  }
  const overview = store().overview;
  if (overview) store().set({ overview: { ...overview, notes: Math.max(0, overview.notes - 1) } });
  return true;
}

/** "Add a note". Resolves false when the home PC didn't keep it. */
export async function addMemoryNote(text: string): Promise<boolean> {
  if (!text.trim()) return false;
  try {
    const note = await withAccess((a) => addNote(a, text));
    const overview = store().overview;
    store().set({
      notes: [note, ...store().notes.filter((n) => n.id !== note.id)],
      overview: overview ? { ...overview, notes: overview.notes + 1 } : overview,
    });
    return true;
  } catch {
    return false;
  }
}

/** "Forget everything": every note and learned answer of the profile. */
export async function forgetEverything(): Promise<boolean> {
  try {
    await withAccess(forgetAll);
    store().set({ notes: [], overview: { notes: 0, exchanges: 0, rated: 0, ready: true } });
    return true;
  } catch {
    return false;
  }
}

/**
 * "Remember things about me": `PATCH /me { memory_enabled }`, then a fresh llm_token, whose
 * `memory` claim zypherLL reads. Works away too. Resolves false when Laravel refused.
 */
export async function setRememberMe(enabled: boolean): Promise<boolean> {
  const current = session();
  if (!current) return false;
  try {
    const profile = await api.updateMe(current.server, current.session.profileToken, {
      memory_enabled: enabled,
    });
    const now = firstRun().session;
    if (now?.profileToken === current.session.profileToken) {
      firstRun().set({ session: { ...now, profile: { ...now.profile, ...profile } } });
    }
  } catch {
    return false;
  }
  await refreshToken();
  await refreshMemory();
  return true;
}

/** The activity log's first page. */
export async function refreshActivity(): Promise<boolean> {
  const current = session();
  if (!current) return false;
  try {
    const page = await api.listActivity(current.server, current.session.profileToken);
    store().set({ activity: page.data, activityLoaded: true });
    return true;
  } catch {
    store().set({ activityLoaded: store().activityLoaded ?? false });
    return false;
  }
}

/** "Clear log" (B5). A 404 / 405 hides the button: Laravel doesn't have it yet. */
export async function clearActivityLog(): Promise<boolean> {
  const current = session();
  if (!current) return false;
  try {
    await api.clearActivity(current.server, current.session.profileToken);
    store().set({ activity: [] });
    return true;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
      store().set({ canClearLog: false });
    }
    return false;
  }
}
