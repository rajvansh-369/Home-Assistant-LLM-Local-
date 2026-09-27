// 5.1 Settings actions. The engine choice is kept on the phone first and sent to Laravel
// (PATCH /me) when that profile's session is open, so a choice made while the request fails, or
// before a session exists, still arrives at the profile's next unlock.
import { api, type LlmEngine, type Profile } from '@/services/api';
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';

const store = () => useFirstRunStore.getState();

/** "saved": Laravel has it. "pending": kept on this phone, sent at the next unlock. */
export type EngineSave = 'saved' | 'pending';

/** The profile a choice made right now belongs to: the unlocked one, else the Owner. */
function currentProfileId(): number | null {
  const { session, owner, llmEngineProfileId } = store();
  return session?.profile.id ?? llmEngineProfileId ?? owner?.id ?? null;
}

/** 5.1 Assistant: pick who answers chats. Takes effect at once for this phone. */
export async function chooseLlmEngine(engine: LlmEngine): Promise<EngineSave> {
  const { session } = store();
  store().set({
    llmEngine: engine,
    llmEngineProfileId: currentProfileId(),
    llmEngineSynced: false,
    ...(session
      ? { session: { ...session, profile: { ...session.profile, llm_engine: engine } } }
      : {}),
  });
  return syncLlmEngine();
}

/** Send the phone's choice to Laravel if it hasn't been yet. Never throws. */
export async function syncLlmEngine(): Promise<EngineSave> {
  const { serverUrl, session, llmEngine, llmEngineSynced, llmEngineProfileId } = store();
  if (llmEngineSynced) return 'saved';
  if (!serverUrl || !isUnlocked(session) || session!.profile.id !== llmEngineProfileId)
    return 'pending';

  try {
    await api.updateMe(serverUrl, session!.profileToken, { llm_engine: llmEngine });
  } catch {
    return 'pending';
  }
  // Switched again while the request was out: that newer choice still has to go.
  if (store().llmEngine !== llmEngine) return syncLlmEngine();
  store().set({ llmEngineSynced: true });
  return 'saved';
}

/**
 * After unlock: a choice this profile made on this phone that hasn't reached Laravel wins and is
 * sent now; otherwise the profile's engine from Laravel does, which also picks up a change made
 * on another phone. (A pending choice of another profile is dropped: it only exists when its
 * PATCH failed, and that profile picks again.)
 */
export async function afterUnlockSyncEngine(profile: Profile) {
  const { llmEngineSynced, llmEngineProfileId, llmEngine, session } = store();
  if (!llmEngineSynced && llmEngineProfileId === profile.id) {
    if (session)
      store().set({
        session: { ...session, profile: { ...session.profile, llm_engine: llmEngine } },
      });
    await syncLlmEngine();
    return;
  }
  store().set({
    llmEngine: profile.llm_engine ?? 'local',
    llmEngineProfileId: profile.id,
    llmEngineSynced: true,
  });
}
