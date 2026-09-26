// 5.1 Settings actions. The engine choice is kept on the phone first and sent to Laravel when a
// profile session is open, so it works after a restart too, when there is no session until the
// next unlock.
import { api, type LlmEngine } from '@/services/api';
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';

const store = () => useFirstRunStore.getState();

/** "saved": Laravel has it. "pending": kept on this phone, sent at the next unlock. */
export type EngineSave = 'saved' | 'pending';

/** 5.1 Assistant: pick who answers chats. Takes effect at once for this phone. */
export async function chooseLlmEngine(engine: LlmEngine): Promise<EngineSave> {
  store().set({ llmEngine: engine, llmEngineSynced: false });
  return syncLlmEngine();
}

/** Send the phone's choice to Laravel if it hasn't been yet. Never throws. */
export async function syncLlmEngine(): Promise<EngineSave> {
  const { owner, serverUrl, session, llmEngine, llmEngineSynced } = store();
  if (llmEngineSynced) return 'saved';
  if (!owner || !serverUrl || !isUnlocked(session)) return 'pending';

  try {
    await api.updateProfile(serverUrl, session!.profileToken, owner.id, { llm_engine: llmEngine });
  } catch {
    return 'pending';
  }
  // Switched again while the request was out: that newer choice still has to go.
  if (store().llmEngine !== llmEngine) return syncLlmEngine();
  store().set({ llmEngineSynced: true });
  return 'saved';
}

/**
 * After unlock: a choice made on this phone while locked wins and is sent now; otherwise the
 * profile's engine from Laravel does, which picks up a change made on another phone.
 */
export async function afterUnlockSyncEngine(serverEngine: LlmEngine | undefined) {
  if (!store().llmEngineSynced) {
    await syncLlmEngine();
  } else if (serverEngine) {
    store().set({ llmEngine: serverEngine });
  }
}
