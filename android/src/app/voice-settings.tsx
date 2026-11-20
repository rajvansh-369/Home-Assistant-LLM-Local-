// 5.1's "Voice and speech" (docs/aster-voice-plan.md §3 5.1): profiles that may use voice; anyone
// else goes back to Settings, where the row isn't shown.
import { Redirect } from 'expo-router';

import { useFirstRunStore } from '@/features/first-run/store';
import { SessionGate } from '@/features/profiles/SessionGate';
import { voiceAllowed } from '@/features/voice/access';
import { VoiceSettingsScreen } from '@/features/voice/VoiceSettingsScreen';

function WithVoice() {
  const profile = useFirstRunStore((state) => state.session?.profile);
  if (!voiceAllowed(profile)) return <Redirect href="/settings" />;
  return <VoiceSettingsScreen />;
}

export default function VoiceSettings() {
  return (
    <SessionGate>
      <WithVoice />
    </SessionGate>
  );
}
