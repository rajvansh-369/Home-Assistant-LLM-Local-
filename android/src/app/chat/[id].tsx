// 3.4 Chat (docs/aster-home-chat-plan.md §4.7): `new` starts a saved chat with the first question,
// `private` a chat that is neither saved nor remembered, anything else opens that saved chat.
// `q` sends a first question (a 3.1 suggestion). More options deletes the chat. `about=messages`
// is 4.1's "Ask about it": a private chat with the unread messages as its context
// (docs/aster-messages-alerts-plan.md §6).
import { router, useLocalSearchParams } from 'expo-router';
import { EyeOff, MoreVertical } from 'lucide-react-native';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { IconButton, InfoCallout, ScreenHeader } from '@/components';
import { deleteChat } from '@/features/chat/actions';
import { chat as copy, chats as listCopy } from '@/features/chat/copy';
import { ChatView } from '@/features/chat/ChatView';
import { useAskAboutContext } from '@/features/messages/catchup';
import { messages as messagesCopy } from '@/features/messages/copy';
import { SessionGate } from '@/features/profiles/SessionGate';
import { useVoiceAccess } from '@/features/voice/access';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/chats');
}

function confirmDelete(chatUuid: string) {
  Alert.alert(listCopy.delete, listCopy.deleteConfirm, [
    { text: listCopy.cancel, style: 'cancel' },
    {
      text: listCopy.delete,
      style: 'destructive',
      onPress: () => {
        deleteChat(chatUuid);
        goBack();
      },
    },
  ]);
}

export default function Chat() {
  const { id, q, about } = useLocalSearchParams<{ id: string; q?: string; about?: string }>();
  const isPrivate = id === 'private';
  const aboutMessages = isPrivate && about === 'messages';
  const context = useAskAboutContext(aboutMessages);
  const chatUuid = id === 'new' || isPrivate ? null : id;
  const onMissing = useCallback(() => goBack(), []);
  const voice = useVoiceAccess();
  // Private chats stay out of voice for now: a voice turn is always a saved chat (voice plan §4).
  const onTalk = useCallback(
    (current: string | null) =>
      router.push(current ? { pathname: '/voice', params: { chat: current } } : '/voice'),
    [],
  );

  return (
    <SessionGate>
      <ChatView
        mode={isPrivate ? 'private' : 'saved'}
        chatUuid={chatUuid}
        initialQuestion={q}
        onMissing={onMissing}
        context={context}
        onTalk={voice.allowed && !isPrivate ? onTalk : undefined}
        banner={
          isPrivate ? (
            <InfoCallout
              icon={EyeOff}
              tone="neutral"
              text={aboutMessages ? messagesCopy.askBanner : copy.privateBanner}
            />
          ) : null
        }
        header={({ title, subtitle, chatUuid: current }) => (
          <ScreenHeader
            title={
              title ??
              (aboutMessages
                ? messagesCopy.askTitle
                : isPrivate
                  ? copy.privateTitle
                  : copy.newTitle)
            }
            subtitle={subtitle}
            onBack={goBack}
          >
            {!isPrivate && current ? (
              <IconButton
                icon={MoreVertical}
                label={copy.moreOptions}
                onPress={() => confirmDelete(current)}
              />
            ) : null}
          </ScreenHeader>
        )}
      />
    </SessionGate>
  );
}
