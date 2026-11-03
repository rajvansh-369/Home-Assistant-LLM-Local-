// 3.6 Voice (docs/aster-voice-plan.md §3). `chat` continues a saved chat (3.4's "Talk instead",
// which then gets its screen back on "Switch to typing"); without it the first question starts one.
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { SessionGate } from '@/features/profiles/SessionGate';
import { useVoiceAccess } from '@/features/voice/access';
import { VoiceScreen } from '@/features/voice/VoiceScreen';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

function VoiceRoute() {
  const { chat } = useLocalSearchParams<{ chat?: string }>();
  const { allowed } = useVoiceAccess();
  const fromChat = chat != null && chat !== '';

  const switchToTyping = useCallback(
    (current: string | null) => {
      if (fromChat) {
        close();
        return;
      }
      router.replace({ pathname: '/chat/[id]', params: { id: current ?? 'new' } });
    },
    [fromChat],
  );

  if (!allowed) return <Redirect href="/home" />;
  return (
    <VoiceScreen
      chatUuid={fromChat ? chat : null}
      onClose={close}
      onSwitchToTyping={switchToTyping}
    />
  );
}

export default function Voice() {
  return (
    <SessionGate>
      <VoiceRoute />
    </SessionGate>
  );
}
