// Who may talk to Aster, and when (docs/aster-voice-plan.md §1, decisions 4 and 8): the unlocked
// profile, not Guest, with the Owner's "Voice and wake word" (`voice_enabled`) and "Chat with
// Aster" on, at home with the model ready. The phone enforces this; Laravel only stores the switch.
import type { Session } from '@/features/first-run/store';
import { useFirstRunStore } from '@/features/first-run/store';
import type { HomeMode } from '@/features/home-mode/mode';
import { useHomeModeStore } from '@/features/home-mode/store';
import type { Profile } from '@/services/api';

/** The profile may use voice at all (mic buttons, 3.6, the wake word). */
export function voiceAllowed(profile: Profile | null | undefined): boolean {
  if (!profile || profile.role === 'guest') return false;
  return profile.voice_enabled !== false && profile.chat_enabled !== false;
}

/** Voice can answer now: allowed, a chat token, and at home with the model ready. */
export function voiceReady(session: Session | null, mode: HomeMode): boolean {
  return voiceAllowed(session?.profile) && session?.llmToken != null && mode.kind === 'ready';
}

/** For screens: `allowed` shows the mic; `ready` lets it answer. */
export function useVoiceAccess(): { allowed: boolean; ready: boolean } {
  const session = useFirstRunStore((state) => state.session);
  const mode = useHomeModeStore((state) => state.mode);
  return { allowed: voiceAllowed(session?.profile), ready: voiceReady(session, mode) };
}
