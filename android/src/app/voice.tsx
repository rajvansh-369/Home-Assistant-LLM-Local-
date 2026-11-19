// 3.6 Voice (docs/aster-voice-plan.md §3). `chat` continues a saved chat (3.4's "Talk instead",
// which then gets its screen back on "Switch to typing"); without it the first question starts one.
// `thread` is the missed-message notification's Reply by voice (aster://voice?thread={key}); a
// profile without voice gets 4.2 for that chat instead.
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { SessionGate } from '@/features/profiles/SessionGate';
import { useVoiceAccess } from '@/features/voice/access';
import { VoiceScreen } from '@/features/voice/VoiceScreen';

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

function editReminder(clientUuid: string) {
  router.push({ pathname: '/reminder/[id]', params: { id: clientUuid } });
}

function openThread(key: string) {
  router.replace({ pathname: '/thread/[key]', params: { key } });
}

function VoiceRoute() {
  const { chat, thread } = useLocalSearchParams<{ chat?: string; thread?: string }>();
  const { allowed } = useVoiceAccess();
  const fromChat = chat != null && chat !== '';
  const threadKey = thread != null && thread !== '' ? thread : null;

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

  if (!allowed) {
    return threadKey ? (
      <Redirect href={`/thread/${threadKey}`} />
    ) : (
      <Redirect href="/home" />
    );
  }
  return (
    <VoiceScreen
      chatUuid={fromChat ? chat : null}
      onClose={close}
      onSwitchToTyping={switchToTyping}
      threadKey={threadKey}
      onEditReminder={editReminder}
      onOpenThread={openThread}
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
