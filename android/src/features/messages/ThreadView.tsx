// 4.2 Thread (docs/aster-messages-alerts-plan.md §3): the captured messages of one chat, the
// "Aster read these aloud" marker, and the reply card: "Your reply", Send through the source app's
// Reply action, and the note when that notification is gone. Opening it marks the chat read.
import { router } from 'expo-router';
import { Check, ExternalLink, Send, Star, Volume2 } from 'lucide-react-native';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton, ChatBubble, DateDivider, PrimaryButton, SmallPill, Text } from '@/components';
import {
  colors,
  hitSlopFor,
  iconSizes,
  maxFontSizeMultiplier,
  radii,
  sizes,
  spacing,
  strokes,
  typography,
} from '@/theme';

import AsterSystem, {
  type CapturedMessage,
  type CapturedThread,
} from '../../../modules/aster-system';

import { sendReply, toggleVip } from './actions';
import { useAlertsStore } from './alerts';
import { messages as listCopy, sources, thread as copy } from './copy';
import { clock, dayLabel, sameDay } from './format';
import { markThreadRead, refreshThreads, useThreadsStore } from './threads';
import { SenderAvatar } from './ThreadRow';
import { threadVip, vipForTitle } from './vip';

export const THREAD_MESSAGES = 200;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/messages');
}

function Received({
  message,
  showSender,
  revealed,
  onReveal,
}: {
  message: CapturedMessage;
  showSender: boolean;
  revealed: boolean;
  onReveal: () => void;
}) {
  const hidden = message.otp && !revealed;
  const body = (
    <>
      {showSender ? (
        <Text variant="label" tone="secondary">
          {message.sender}
        </Text>
      ) : null}
      <Text variant="body" tone={hidden ? 'muted' : 'primary'} selectable={!hidden}>
        {hidden ? listCopy.otpHidden : message.text}
      </Text>
      <Text variant="monoSmall" tone="muted" style={styles.bubbleTime}>
        {clock(message.at)}
      </Text>
    </>
  );
  if (hidden) {
    return (
      <Pressable onPress={onReveal} accessibilityRole="button" style={styles.received}>
        {body}
      </Pressable>
    );
  }
  return <View style={styles.received}>{body}</View>;
}

type ReplyCardProps = {
  thread: CapturedThread;
  draft: string;
  onDraft: (text: string) => void;
  /** At home: the suggestions and Rewrite (4.2's AI help), shown above "Your reply". */
  assist?: ReactNode;
};

function ReplyCard({ thread, draft, onDraft, assist }: ReplyCardProps) {
  const source = sources[thread.source];
  const [sending, setSending] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const canReply = thread.canReply && !gone;

  async function send() {
    if (!draft.trim() || sending) return;
    setSending(true);
    setFailed(false);
    const result = await sendReply(thread, draft);
    setSending(false);
    if (result === 'sent') {
      setSentAt(Date.now());
      onDraft('');
    } else if (result === 'no-action') {
      setGone(true);
    } else {
      setFailed(true);
    }
  }

  return (
    <View style={styles.replyCard}>
      {assist}
      <View style={styles.field}>
        <Text variant="label" tone="secondary" nativeID="reply-label">
          {copy.yourReply}
        </Text>
        <TextInput
          value={draft}
          onChangeText={(text) => {
            onDraft(text);
            setSentAt(null);
            setFailed(false);
          }}
          multiline
          accessibilityLabel={copy.yourReply}
          accessibilityLabelledBy="reply-label"
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
      </View>
      {sentAt != null && !draft ? (
        // Apps often clear their notification after a reply, so this shows even when it's gone.
        <View style={styles.sent} accessibilityLiveRegion="polite">
          <Check size={iconSizes.status} color={colors.accent} strokeWidth={strokes.check} />
          <Text variant="status" tone="accent">
            {copy.sent(source, clock(sentAt))}
          </Text>
        </View>
      ) : canReply ? (
        <PrimaryButton
          label={copy.send(source)}
          icon={Send}
          onPress={send}
          busy={sending}
          disabled={!draft.trim()}
        />
      ) : (
        <View style={styles.gone}>
          <Text variant="bodySmall" tone="secondary">
            {copy.gone(source)}
          </Text>
          <SmallPill
            label={copy.open(source)}
            icon={ExternalLink}
            onPress={() => AsterSystem.openSourceApp(thread.key, thread.source)}
          />
        </View>
      )}
      {failed ? (
        <Text variant="status" tone="danger" accessibilityLiveRegion="polite">
          {copy.sendFailed}
        </Text>
      ) : null}
      <Text variant="helper" tone="muted">
        {copy.footnote(source)}
      </Text>
    </View>
  );
}

type ThreadViewProps = {
  threadKey: string;
  /** 4.2's AI help, given the thread, its messages and the draft setter (M4). */
  assist?: (props: {
    thread: CapturedThread;
    messages: CapturedMessage[];
    draft: string;
    onDraft: (text: string) => void;
  }) => ReactNode;
};

export function ThreadView({ threadKey, assist }: ThreadViewProps) {
  const thread = useThreadsStore((state) => state.threads.find((t) => t.key === threadKey));
  const loaded = useThreadsStore((state) => state.loaded);
  const vips = useAlertsStore((state) => state.vips);
  const [items, setItems] = useState<CapturedMessage[]>([]);
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(new Set());
  const [draft, setDraft] = useState('');
  const [vipFailed, setVipFailed] = useState(false);
  const scroll = useRef<KeyboardAwareScrollViewRef>(null);
  const unread = thread?.unreadSenders.length ?? 0;

  useEffect(() => {
    void markThreadRead(threadKey);
    void refreshThreads();
  }, [threadKey]);

  // New messages while it's open are read as they arrive.
  useEffect(() => {
    if (unread > 0) void markThreadRead(threadKey);
  }, [threadKey, unread]);

  useEffect(() => {
    let alive = true;
    AsterSystem.threadMessages(threadKey, THREAD_MESSAGES)
      .then((list) => alive && setItems(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [threadKey, thread?.count, thread?.last.id]);

  useEffect(() => {
    if (loaded && !thread) goBack();
  }, [loaded, thread]);

  if (!thread) return <SafeAreaView style={styles.root} />;

  const source = sources[thread.source];
  const vip = threadVip(thread, vips) != null;
  // From the subscribed list, not the store's getState: React Compiler caches pure-looking calls.
  const contact = thread.isGroup ? null : vipForTitle(vips, thread.source, thread.title);
  const lastSpoken = items.reduce<number | null>(
    (latest, m, i) => (m.spokenAt != null ? i : latest),
    null,
  );
  const now = new Date();

  async function star() {
    setVipFailed(false);
    if (!(await toggleVip(thread!))) setVipFailed(true);
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <BackButton onPress={goBack} />
        <View style={styles.who}>
          <SenderAvatar name={thread.title} source={thread.source} size="thread" />
          <View style={styles.titles}>
            <Text variant="headerTitle" numberOfLines={1} accessibilityRole="header">
              {thread.title || listCopy.noName}
            </Text>
            <Text variant="helper" tone="muted" numberOfLines={1}>
              {copy.subtitle(source, vip)}
            </Text>
          </View>
        </View>
        {!thread.isGroup ? (
          <Pressable
            onPress={star}
            hitSlop={hitSlopFor(sizes.iconButton)}
            accessibilityRole="button"
            accessibilityLabel={copy.vipButton}
            accessibilityState={{ selected: contact?.enabled ?? false }}
            style={styles.star}
          >
            <Star
              size={iconSizes.headerAction}
              color={contact?.enabled ? colors.warning : colors.textSecondary}
              fill={contact?.enabled ? colors.warning : 'none'}
              strokeWidth={strokes.icon}
            />
          </Pressable>
        ) : null}
      </View>
      {vipFailed ? (
        <Text
          variant="status"
          tone="danger"
          style={styles.vipFailed}
          accessibilityLiveRegion="polite"
        >
          {copy.vipSaveFailed}
        </Text>
      ) : null}
      <KeyboardAwareScrollView
        ref={scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={spacing.contentBottom}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        {items.map((message, i) => {
          const previous = items[i - 1];
          const divider = !previous || !sameDay(previous.at, message.at);
          const showSender =
            thread.isGroup && !message.outgoing && previous?.sender !== message.sender;
          return (
            <Fragment key={message.id}>
              {divider ? <DateDivider label={dayLabel(message.at, copy.today, now)} /> : null}
              {message.outgoing ? (
                <ChatBubble text={message.text} />
              ) : (
                <Received
                  message={message}
                  showSender={showSender || (thread.isGroup && divider)}
                  revealed={revealed.has(message.id)}
                  onReveal={() => setRevealed(new Set(revealed).add(message.id))}
                />
              )}
              {i === lastSpoken && message.spokenAt != null ? (
                <View style={styles.marker}>
                  <Volume2
                    size={iconSizes.pill}
                    color={colors.warning}
                    strokeWidth={strokes.icon}
                  />
                  <Text variant="marker" tone="warning">
                    {copy.readAloudMarker(clock(message.spokenAt))}
                  </Text>
                </View>
              ) : null}
            </Fragment>
          );
        })}
        <ReplyCard
          thread={thread}
          draft={draft}
          onDraft={setDraft}
          assist={assist?.({ thread, messages: items, draft, onDraft: setDraft })}
        />
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    minHeight: sizes.screenHeader,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.headerX,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  titles: { flex: 1, minWidth: 0 },
  star: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vipFailed: { paddingHorizontal: spacing.screenX, paddingTop: 8 },
  content: {
    paddingHorizontal: spacing.chatX,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 10,
  },
  received: {
    alignSelf: 'flex-start',
    maxWidth: '82%',
    backgroundColor: colors.surface2,
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 2,
    borderTopLeftRadius: radii.bubble,
    borderTopRightRadius: radii.bubble,
    borderBottomRightRadius: radii.bubble,
    borderBottomLeftRadius: radii.bubbleTail,
  },
  bubbleTime: { alignSelf: 'flex-end' },
  marker: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  replyCard: {
    gap: 12,
    padding: 16,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  field: { gap: 8 },
  input: {
    ...typography.body,
    minHeight: sizes.draftInput,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: colors.text,
    textAlignVertical: 'top',
  },
  sent: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gone: { gap: 10, alignItems: 'flex-start' },
});
