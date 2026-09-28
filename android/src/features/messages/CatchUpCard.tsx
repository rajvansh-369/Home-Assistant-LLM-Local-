// 4.1's Catch-up card (docs/aster-messages-alerts-plan.md §3 4.1, §6): "12 unread · 5 chats", the
// summary from the local model at home (once per set of unread messages), Read aloud and Ask about
// it. Away, or while the model isn't ready, Read aloud reads the messages themselves.
import { router } from 'expo-router';
import { MessageCircle, Volume2, type LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { OrbDot, Text } from '@/components';
import { useHomeModeStore } from '@/features/home-mode/store';
import { colors, iconSizes, radii, sizes, strokes } from '@/theme';

import AsterSystem, { type CapturedThread } from '../../../modules/aster-system';

import { useAlertsStore } from './alerts';
import {
  cachedCatchUp,
  catchUpKey,
  readOutText,
  unreadMessages,
  writeCatchUp,
  type UnreadItem,
} from './catchup';
import { messages as copy } from './copy';
import { unreadCount } from './threads';

export function CardButton({
  icon: Icon,
  label,
  onPress,
  tone = 'accent',
  tall = false,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  /** The icon's colour: accent on 4.1, warning on 3.1. */
  tone?: 'accent' | 'warning';
  tall?: boolean;
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
        styles.button,
        { height: tall ? sizes.cardButtonTall : sizes.cardButton },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon
        size={iconSizes.cardButton}
        color={tone === 'warning' ? colors.warning : colors.accent}
        strokeWidth={strokes.icon}
      />
      <Text variant="link">{label}</Text>
    </Pressable>
  );
}

/** Speaks `text`; a second tap while speaking stops. */
export function useReadAloud() {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => AsterSystem.stopSpeaking(), []);
  return {
    speaking,
    toggle(text: string) {
      if (speaking) {
        AsterSystem.stopSpeaking();
        setSpeaking(false);
        return;
      }
      if (!text.trim()) return;
      setSpeaking(true);
      void AsterSystem.speak(text)
        .catch(() => false)
        .finally(() => setSpeaking(false));
    },
  };
}

export function CatchUpCard({ threads }: { threads: CapturedThread[] }) {
  const ready = useHomeModeStore((state) => state.mode.kind === 'ready');
  const vips = useAlertsStore((state) => state.vips);
  const [items, setItems] = useState<UnreadItem[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [written, setWritten] = useState<{ key: string; text: string } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const readAloud = useReadAloud();

  const unread = threads.reduce((sum, thread) => sum + unreadCount(thread), 0);
  const chats = threads.filter((thread) => unreadCount(thread) > 0).length;
  // Only a change in which messages are unread asks again.
  const unreadKey = useMemo(
    () => threads.map((t) => `${t.key}:${t.last.id}:${unreadCount(t)}`).join('|'),
    [threads],
  );
  // One try per set of unread messages and Try again.
  const key = `${catchUpKey(items)}#${attempt}`;
  const summary = cachedCatchUp(items) ?? (written?.key === key ? written.text : null);
  const failed = failedKey === key;
  const writing = ready && items.length > 0 && !summary && !failed;

  useEffect(() => {
    let alive = true;
    void unreadMessages(threads).then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
    // `threads` changes identity on every refresh; unreadKey says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey]);

  useEffect(() => {
    if (!ready || items.length === 0 || cachedCatchUp(items)) return;
    const abort = new AbortController();
    writeCatchUp(items, (text) => setWritten({ key, text }), abort.signal)
      .then((text) => {
        if (!abort.signal.aborted) setWritten({ key, text });
      })
      .catch(() => {
        if (!abort.signal.aborted) setFailedKey(key);
      });
    return () => abort.abort();
    // `key` stands for `items` and Try again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  return (
    <View style={styles.card}>
      <View style={styles.title}>
        <OrbDot size={sizes.orbSmall - 2} />
        <Text variant="cardLabel" style={styles.grow} accessibilityRole="header">
          {copy.catchUp.title}
        </Text>
        {unread > 0 ? (
          <Text variant="monoSmall" tone="muted">
            {copy.catchUp.counts(unread, chats)}
          </Text>
        ) : null}
      </View>
      {unread === 0 ? (
        <Text variant="bodySmall" tone="secondary">
          {copy.catchUp.allCaughtUp}
        </Text>
      ) : (
        <>
          {summary ? (
            <Text variant="bodySmall" accessibilityLiveRegion="polite">
              {summary}
            </Text>
          ) : writing ? (
            <Text variant="bodySmall" tone="muted">
              {copy.catchUp.writing}
            </Text>
          ) : failed ? (
            <View style={styles.failed}>
              <Text variant="bodySmall" tone="secondary">
                {copy.catchUp.failed}
              </Text>
              <Pressable
                onPress={() => setAttempt(attempt + 1)}
                accessibilityRole="button"
                hitSlop={12}
              >
                <Text variant="link" tone="accent">
                  {copy.catchUp.tryAgain}
                </Text>
              </Pressable>
            </View>
          ) : !ready ? (
            <Text variant="bodySmall" tone="muted">
              {copy.catchUp.needsHome}
            </Text>
          ) : null}
          <View style={styles.buttons}>
            <CardButton
              icon={Volume2}
              label={copy.catchUp.readAloud}
              onPress={() => readAloud.toggle(summary ?? readOutText(items, vips))}
            />
            <CardButton
              icon={MessageCircle}
              label={copy.catchUp.askAbout}
              disabled={!ready}
              onPress={() =>
                router.push({
                  pathname: '/chat/[id]',
                  params: { id: 'private', about: 'messages' },
                })
              }
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.card - 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  title: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  buttons: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  pressed: { backgroundColor: colors.track },
  disabled: { opacity: 0.5 },
});
