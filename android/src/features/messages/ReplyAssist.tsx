// 4.2's suggested reply (docs/aster-messages-alerts-plan.md §3 4.2, §6): at home with the model
// ready, the orb and "Aster · suggested reply", a one-line summary, three reply chips that fill the
// draft, and Rewrite (Shorter, Warmer, Hinglish). Away, or while the model isn't ready, one line
// says suggestions need the home server; the Owner can still type and send.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { OrbDot, Text } from '@/components';
import { useHomeModeStore } from '@/features/home-mode/store';
import { colors, radii, sizes } from '@/theme';

import type { CapturedMessage, CapturedThread } from '../../../modules/aster-system';

import { thread as copy } from './copy';
import {
  cachedSuggestion,
  draftReplies,
  rewriteReply,
  type RewriteKind,
  type Suggestion,
} from './drafts';

type ReplyAssistProps = {
  thread: CapturedThread;
  messages: CapturedMessage[];
  draft: string;
  onDraft: (text: string) => void;
};

function Chip({
  label,
  onPress,
  tone,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone: 'accent' | 'neutral';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.chip,
        tone === 'accent' ? styles.accentChip : styles.neutralChip,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text variant="chip" tone={tone === 'accent' ? 'accent' : 'secondary'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ReplyAssist({ thread, messages, draft, onDraft }: ReplyAssistProps) {
  const ready = useHomeModeStore((state) => state.mode.kind === 'ready');
  const [attempt, setAttempt] = useState(0);
  const last = messages.at(-1);
  const lastId = last?.id;
  // Their turn is over and ours is next: the last message is theirs (and not all codes).
  const awaiting = last != null && !last.outgoing && messages.some((m) => !m.outgoing && !m.otp);
  // One try per thread, newest message and Try again.
  const key = `${thread.key}:${lastId ?? 0}:${attempt}`;
  const [made, setMade] = useState<{ key: string; suggestion: Suggestion } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState<RewriteKind | null>(null);
  const [rewriteFailed, setRewriteFailed] = useState(false);
  const suggestion =
    cachedSuggestion(thread, messages) ?? (made?.key === key ? made.suggestion : null);
  const failed = failedKey === key || rewriteFailed;
  const drafting = !suggestion && failedKey !== key;
  // The effect below reads the newest draft without re-running on every keystroke.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  });

  useEffect(() => {
    if (!ready || !awaiting) return;
    const hit = cachedSuggestion(thread, messages);
    if (hit) {
      if (!draftRef.current) onDraft(hit.draft);
      return;
    }
    const abort = new AbortController();
    draftReplies(thread, messages, abort.signal)
      .then((result) => {
        if (abort.signal.aborted) return;
        setMade({ key, suggestion: result });
        if (!draftRef.current) onDraft(result.draft);
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailedKey(key);
      });
    return () => abort.abort();
    // `key` stands for the thread, its newest message and Try again; not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, awaiting, key]);

  async function rewrite(kind: RewriteKind) {
    if (!draft.trim() || rewriting) return;
    setRewriting(kind);
    setRewriteFailed(false);
    try {
      onDraft(await rewriteReply(kind, draft, thread, messages));
    } catch {
      setRewriteFailed(true);
    } finally {
      setRewriting(null);
    }
  }

  if (!awaiting) return null;
  if (!ready) {
    return (
      <Text variant="bodySmall" tone="muted">
        {copy.needsHome}
      </Text>
    );
  }

  return (
    <View style={styles.assist}>
      <View style={styles.title}>
        <OrbDot size={sizes.orbSmall - 2} />
        <Text variant="cardLabel">{copy.aster}</Text>
        <Text variant="bodySmall" tone="muted">
          {copy.suggested}
        </Text>
      </View>
      {drafting ? (
        <Text variant="bodySmall" tone="muted" accessibilityLiveRegion="polite">
          {copy.drafting}
        </Text>
      ) : null}
      {failed ? (
        <View style={styles.failed} accessibilityLiveRegion="polite">
          <Text variant="bodySmall" tone="secondary">
            {copy.draftFailed}
          </Text>
          <Pressable
            onPress={() => {
              setRewriteFailed(false);
              setAttempt(attempt + 1);
            }}
            accessibilityRole="button"
            hitSlop={12}
          >
            <Text variant="link" tone="accent">
              {copy.tryAgain}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {suggestion?.summary ? (
        <Text variant="bodySmall" tone="secondary">
          {suggestion.summary}
        </Text>
      ) : null}
      {suggestion && suggestion.replies.length > 0 ? (
        <View style={styles.chips}>
          {suggestion.replies.map((reply) => (
            <Chip
              key={reply.label}
              label={reply.label}
              tone="accent"
              onPress={() => onDraft(reply.text)}
            />
          ))}
        </View>
      ) : null}
      {suggestion ? (
        <View style={styles.rewrite}>
          <Text variant="bodySmall" tone="muted">
            {copy.rewrite}
          </Text>
          {copy.rewrites.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              tone="neutral"
              disabled={rewriting != null || !draft.trim()}
              onPress={() => void rewrite(option.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  assist: { gap: 12 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rewrite: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: sizes.rewriteChip,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  accentChip: {
    minHeight: sizes.filterChip,
    backgroundColor: colors.accentTint,
    borderColor: colors.accentBorder,
  },
  neutralChip: { backgroundColor: colors.surface2, borderColor: colors.border },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
});
