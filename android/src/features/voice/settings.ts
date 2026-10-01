// Voice settings of this phone (docs/aster-voice-plan.md §3 5.1, decision 9): "Wake word
// 'Hey Aster'" and "Voice and speech" (the device voice and speed). Kept in AsyncStorage and handed
// to the native speaker whenever they change or load. Who may use voice at all is the profile's
// `voice_enabled` on Laravel (access.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import AsterSystem from '../../../modules/aster-system';

export const VOICE_SETTINGS_KEY = 'aster.voice';

/** The speeds 5.1's sheet offers. (proposed) */
export const SPEECH_RATES = [0.8, 1.0, 1.2] as const;

export type VoiceSettings = {
  /** "Wake word 'Hey Aster'": on as drawn; it only listens at home (V4). */
  wakeWord: boolean;
  /** A device voice's name from listVoices, or null for the phone's default. */
  voice: string | null;
  rate: number;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { wakeWord: true, voice: null, rate: 1.0 };

type VoiceSettingsStore = VoiceSettings & {
  set: (patch: Partial<VoiceSettings>) => void;
};

/** Hands the voice and speed to the native speaker. Never throws. */
export function pushVoiceSettings(settings: Pick<VoiceSettings, 'voice' | 'rate'>) {
  try {
    AsterSystem.setVoiceSettings(settings.voice, settings.rate);
  } catch {
    // No native side (tests, Expo Go).
  }
}

export const useVoiceSettings = create<VoiceSettingsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_VOICE_SETTINGS,
      set: (patch) => {
        set(patch);
        if ('voice' in patch || 'rate' in patch) pushVoiceSettings(get());
      },
    }),
    {
      name: VOICE_SETTINGS_KEY,
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ wakeWord, voice, rate }) => ({ wakeWord, voice, rate }),
      onRehydrateStorage: () => (state) => {
        if (state) pushVoiceSettings(state);
      },
    },
  ),
);
