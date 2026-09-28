// 4.1 Messages (docs/aster-messages-alerts-plan.md §3): filter chips, the Catch-up card, the VIP
// and "Everyone else" sections of captured threads, the notification-access callout and the
// footnote. Owner only.
import { useFocusEffect } from 'expo-router';
import { BellOff, Info, Star } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AllowPill, ScreenHeader, Text } from '@/components';
import { colors, iconSizes, radii, sizes, spacing, strokes } from '@/theme';

import AsterSystem, {
  type CapturedThread,
  type MessageSource,
} from '../../../modules/aster-system';

import { useAlertsStore } from './alerts';
import { CatchUpCard } from './CatchUpCard';
import { messages as copy } from './copy';
import { byNewest } from './format';
import { refreshThreads, unreadCount, useThreadsStore } from './threads';
import { ThreadRow } from './ThreadRow';
import { threadVip } from './vip';

type Filter = 'all' | MessageSource;

function FilterChip({
  label,
  unread,
  selected,
  onPress,
}: {
  label: string;
  unread: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={copy.filterLabel(label, unread)}
      accessibilityState={{ selected }}
      style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}
    >
      <Text variant="chip" tone={selected ? 'accent' : 'secondary'}>
        {label}
      </Text>
      {unread > 0 ? (
        <Text variant="monoSmall" tone={selected ? 'accent' : 'secondary'} style={styles.chipCount}>
          {unread}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Section({
  label,
  vip,
  threads,
  now,
}: {
  label: string;
  vip: boolean;
  threads: CapturedThread[];
  now: Date;
}) {
  if (threads.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionLabel}>
        {vip ? (
          <Star size={iconSizes.marker} color={colors.warning} strokeWidth={strokes.icon} />
        ) : null}
        <Text variant="caps" tone="muted" accessibilityRole="header">
          {label}
        </Text>
      </View>
      <View style={styles.card}>
        {threads.map((thread, i) => (
          <ThreadRow
            key={thread.key}
            thread={thread}
            vip={vip}
            unread={unreadCount(thread)}
            now={now}
            first={i === 0}
          />
        ))}
      </View>
    </View>
  );
}

export function MessagesScreen() {
  const threads = useThreadsStore((state) => state.threads);
  const listening = useThreadsStore((state) => state.listening);
  const loaded = useThreadsStore((state) => state.loaded);
  const vips = useAlertsStore((state) => state.vips);
  const [filter, setFilter] = useState<Filter>('all');

  useFocusEffect(
    useCallback(() => {
      void refreshThreads();
    }, []),
  );

  const now = new Date();
  const unreadBy = useMemo(() => {
    const counts: Record<Filter, number> = { all: 0, whatsapp: 0, sms: 0, google_chat: 0 };
    for (const thread of threads) {
      counts.all += unreadCount(thread);
      counts[thread.source] += unreadCount(thread);
    }
    return counts;
  }, [threads]);

  const shown = threads.filter((t) => filter === 'all' || t.source === filter).sort(byNewest);
  const vipThreads = shown.filter((t) => threadVip(t, vips) != null);
  const others = shown.filter((t) => threadVip(t, vips) == null);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <ScreenHeader title={copy.title} large />
      <ScrollView contentContainerStyle={styles.content}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.bleed}
        >
          {copy.filters.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              unread={unreadBy[option.id]}
              selected={filter === option.id}
              onPress={() => setFilter(option.id)}
            />
          ))}
        </ScrollView>

        {!listening && loaded ? (
          <View style={styles.callout}>
            <BellOff size={iconSizes.callout} color={colors.warning} strokeWidth={strokes.icon} />
            <Text variant="bodySmall" style={styles.calloutText}>
              {copy.accessOff}
            </Text>
            <AllowPill
              title={copy.accessTitle}
              onPress={() => AsterSystem.openNotificationListenerSettings()}
            />
          </View>
        ) : null}

        {threads.length > 0 ? <CatchUpCard threads={threads} /> : null}

        <Section label={copy.vip} vip threads={vipThreads} now={now} />
        <Section label={copy.everyoneElse} vip={false} threads={others} now={now} />

        {loaded && threads.length === 0 ? (
          <Text variant="bodySmall" tone="muted">
            {copy.empty}
          </Text>
        ) : null}

        <View style={styles.footnote}>
          <Info size={iconSizes.pill} color={colors.textMuted} strokeWidth={strokes.icon} />
          <Text variant="helper" tone="muted" style={styles.footnoteText}>
            {copy.footnote}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.screenX,
    paddingBottom: spacing.contentBottom,
    gap: 16,
  },
  bleed: { marginHorizontal: -spacing.screenX },
  chips: { gap: spacing.chipGap, paddingHorizontal: spacing.screenX },
  chip: {
    height: sizes.filterChip,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  chipOff: { backgroundColor: colors.surface, borderColor: colors.border },
  chipCount: { opacity: 0.8 },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radii.callout,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningTint,
  },
  calloutText: { flex: 1 },
  section: { gap: 8 },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.listCard,
    paddingHorizontal: 16,
  },
  footnote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  footnoteText: { flex: 1 },
});
