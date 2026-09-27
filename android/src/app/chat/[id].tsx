// 3.4 Chat (docs/aster-home-chat-plan.md §4.7): `new` starts a saved chat with the first question,
// `private` a chat that is neither saved nor remembered, anything else opens that saved chat.
// `q` sends a first question (a 3.1 suggestion). More options deletes the chat.
import { router, useLocalSearchParams } from 'expo-router';
import { EyeOff, MoreVertical } from 'lucide-react-native';
import { useCallback } from 'react';
import { Alert } from 'react-native';

import { IconButton, InfoCallout, ScreenHeader } from '@/components';
import { deleteChat } from '@/features/chat/actions';
import { chat as copy, chats as listCopy } from '@/features/chat/copy';
import { ChatView } from '@/features/chat/ChatView';
import { SessionGate } from '@/features/profiles/SessionGate';

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
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>();
  const isPrivate = id === 'private';
  const chatUuid = id === 'new' || isPrivate ? null : id;
  const onMissing = useCallback(() => goBack(), []);

  return (
    <SessionGate>
      <ChatView
        mode={isPrivate ? 'private' : 'saved'}
        chatUuid={chatUuid}
        initialQuestion={q}
        onMissing={onMissing}
        banner={
          isPrivate ? <InfoCallout icon={EyeOff} tone="neutral" text={copy.privateBanner} /> : null
        }
        header={({ title, subtitle, chatUuid: current }) => (
          <ScreenHeader
            title={title ?? (isPrivate ? copy.privateTitle : copy.newTitle)}
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
