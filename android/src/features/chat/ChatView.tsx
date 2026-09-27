// 3.4 / 3.5 Chat, and 2.5 Guest (docs/aster-home-chat-plan.md §4.3, §4.7): the messages, day
// dividers, each answer with its extras, and the composer, disabled with the reason when chat
// isn't available (away, loading, no server).
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssistantMessage, ChatBubble, Composer, DateDivider } from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import { home as homeCopy } from '@/features/home/copy';
import { modelLabel } from '@/features/home-mode/mode';
import { useHomeModeStore } from '@/features/home-mode/store';
import { colors, spacing } from '@/theme';

import { activeEngine } from './ask';
import { chat as copy } from './copy';
import type { LocalMessage } from './store';
import { useChat, type ChatMode } from './useChat';

type ChatViewProps = {
  mode: ChatMode;
  /** A saved chat to open; null starts one (saved mode) or a private / Guest chat. */
  chatUuid: string | null;
  /** Sent once as soon as chat is available (a suggestion from 3.1). */
  initialQuestion?: string;
  /** Receives the title and the "{model} · home server" subtitle. */
  header: (info: { title: string | null; subtitle: string; chatUuid: string | null }) => ReactNode;
  /** Under the header: the private-chat or Guest note. */
  banner?: ReactNode;
  placeholder?: string;
  /** A saved chat was deleted or isn't on this phone. */
  onMissing?: () => void;
};

const dayKey = (iso: string) => new Date(iso).toDateString();

function dividerLabel(iso: string) {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString() ? copy.today : homeCopy.dateLine(date);
}

export function ChatView({
  mode,
  chatUuid,
  initialQuestion,
  header,
  banner,
  placeholder,
  onMissing,
}: ChatViewProps) {
  const chat = useChat(mode, chatUuid);
  const homeMode = useHomeModeStore((state) => state.mode);
  const model = useFirstRunStore((state) => modelLabel(activeEngine(), state.engines));
  const [draft, setDraft] = useState('');
  const list = useRef<FlatList<LocalMessage>>(null);
  const sentInitial = useRef(false);

  const unavailable =
    homeMode.kind === 'ready'
      ? null
      : homeMode.kind === 'loading'
        ? copy.unavailable.loading
        : homeMode.kind === 'checking'
          ? copy.unavailable.checking
          : homeMode.kind === 'noServer' || homeMode.kind === 'failed'
            ? copy.unavailable.noServer
            : copy.unavailable.away;

  useEffect(() => {
    if (chat.missing) onMissing?.();
  }, [chat.missing, onMissing]);

  useEffect(() => {
    if (!initialQuestion || sentInitial.current || unavailable) return;
    sentInitial.current = true;
    chat.send(initialQuestion);
  }, [chat, initialQuestion, unavailable]);

  function submit() {
    if (!draft.trim() || unavailable) return;
    chat.send(draft);
    setDraft('');
  }

  const lastAssistant = [...chat.messages].reverse().find((m) => m.role === 'assistant');

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      {header({ title: chat.title, subtitle: copy.subtitle(model), chatUuid: chat.chatUuid })}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        {banner ? <View style={styles.banner}>{banner}</View> : null}
        <FlatList
          ref={list}
          data={chat.messages}
          keyExtractor={(message) => message.client_uuid}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            const previous = chat.messages[index - 1];
            const divider =
              !previous || dayKey(previous.sent_at) !== dayKey(item.sent_at) ? (
                <DateDivider label={dividerLabel(item.sent_at)} />
              ) : null;
            if (item.role === 'user') {
              return (
                <View style={styles.item}>
                  {divider}
                  <ChatBubble text={item.content} />
                </View>
              );
            }
            const state = chat.live[item.client_uuid];
            const streaming = state?.streaming ?? false;
            const isLast = item.client_uuid === lastAssistant?.client_uuid;
            return (
              <View style={styles.item}>
                {divider}
                <AssistantMessage
                  content={item.content}
                  streaming={streaming}
                  status={state?.status}
                  sources={item.sources}
                  live={item.live}
                  rating={item.rating}
                  stopped={item.finish_reason === 'cancelled'}
                  error={item.error}
                  onRate={
                    item.memory_id != null
                      ? (rating) => chat.rate(item.client_uuid, rating)
                      : undefined
                  }
                  onContinue={
                    isLast && !chat.streamingId && !unavailable && item.finish_reason === 'length'
                      ? () => chat.continueAnswer(item.client_uuid)
                      : undefined
                  }
                />
              </View>
            );
          }}
        />
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={submit}
          onStop={chat.stop}
          streaming={chat.streamingId != null}
          placeholder={placeholder}
          unavailable={unavailable}
          web={chat.web}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  banner: { paddingHorizontal: spacing.chatX - 4, paddingTop: 4 },
  list: { paddingHorizontal: spacing.chatX, paddingVertical: 18, gap: spacing.chatGap },
  item: { gap: spacing.chatGap },
});
