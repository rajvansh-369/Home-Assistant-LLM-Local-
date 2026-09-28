// 3.1 and 3.2 for the Owner (docs/aster-messages-alerts-plan.md §3 3.1 / 3.2): the "Listening ·
// 3 VIPs" chip, "Missed while you were away" with the VIPs' unread chats, Read aloud and
// Summarize, and away, "3 messages from VIPs" with the promise of a catch-up at home.
import { router } from 'expo-router';
import { AlignLeft, Bell, ChevronRight, Volume2 } from 'lucide-react-native';
import { StyleSheet, View, Pressable } from 'react-native';

import { StatusChip, Text } from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import { colors, iconSizes, radii, sizes, strokes } from '@/theme';

import { useAlertsStore } from './alerts';
import { fromVip, readOutText, unreadMessages } from './catchup';
import { CardButton, useReadAloud } from './CatchUpCard';
import { home as copy } from './copy';
import { byNewest } from './format';
import { useThreadsStore } from './threads';
import { ThreadRow, SenderAvatar } from './ThreadRow';
import { threadVip, unreadVipCount } from './vip';

export const MISSED_ROWS = 2;

function useOwner() {
  return useFirstRunStore((state) => state.session?.profile.role === 'owner');
}

/** VIP threads with unread messages, newest first, with their unread VIP counts. */
function useVipUnread() {
  const threads = useThreadsStore((state) => state.threads);
  const vips = useAlertsStore((state) => state.vips);
  const list = threads
    .map((thread) => ({ thread, unread: unreadVipCount(thread, vips) }))
    .filter((entry) => entry.unread > 0)
    .sort((a, b) => byNewest(a.thread, b.thread));
  return { list, vips, total: list.reduce((sum, entry) => sum + entry.unread, 0) };
}

/** "Listening · 3 VIPs": while notification access and alerts are on, with VIPs to listen for. */
export function ListeningChip() {
  const owner = useOwner();
  const listening = useThreadsStore((state) => state.listening);
  const enabled = useAlertsStore((state) => state.settings.enabled);
  const vips = useAlertsStore((state) => state.vips.filter((vip) => vip.enabled).length);
  if (!owner || !listening || !enabled || vips === 0) return null;
  return (
    <StatusChip label={copy.listening(vips)} tone="ready" onPress={() => router.push('/alerts')} />
  );
}

/** 3.1: "Missed while you were away". */
export function MissedCard() {
  const owner = useOwner();
  const { list, vips } = useVipUnread();
  const threads = useThreadsStore((state) => state.threads);
  const readAloud = useReadAloud();
  if (!owner || list.length === 0) return null;
  const now = new Date();

  async function read() {
    if (readAloud.speaking) return readAloud.toggle('');
    const items = await unreadMessages(threads, 20, fromVip(vips));
    readAloud.toggle(readOutText(items, vips));
  }

  return (
    <View style={styles.missed}>
      <View style={styles.missedTitle}>
        <View style={styles.bellTile}>
          <Bell size={iconSizes.search} color={colors.warning} strokeWidth={strokes.icon} />
        </View>
        <Text variant="cardTitle" accessibilityRole="header">
          {copy.missedTitle}
        </Text>
      </View>
      <View>
        {list.slice(0, MISSED_ROWS).map(({ thread, unread }, i) => (
          <ThreadRow
            key={thread.key}
            thread={thread}
            vip
            unread={unread}
            now={now}
            quoted
            first={i === 0}
          />
        ))}
      </View>
      <View style={styles.buttons}>
        <CardButton
          icon={Volume2}
          label={copy.readAloud}
          tone="warning"
          tall
          onPress={() => void read()}
        />
        <CardButton
          icon={AlignLeft}
          label={copy.summarize}
          tone="warning"
          tall
          onPress={() => router.navigate('/messages')}
        />
      </View>
    </View>
  );
}

/** 3.2: "3 messages from VIPs · Aster will offer a catch-up when you get home". */
export function AwayVipCard() {
  const owner = useOwner();
  const { list, vips, total } = useVipUnread();
  if (!owner || list.length === 0) return null;
  const faces = list.slice(0, 3).map(({ thread }) => thread);
  return (
    <Pressable
      onPress={() => router.navigate('/messages')}
      accessibilityRole="button"
      accessibilityLabel={copy.awayTitle(total)}
      accessibilityHint={copy.awayBody}
      style={({ pressed }) => [styles.away, pressed && styles.pressed]}
    >
      <View style={styles.faces}>
        {faces.map((thread, i) => (
          <View key={thread.key} style={[styles.face, i > 0 && styles.faceOverlap]}>
            <SenderAvatar
              name={threadVip(thread, vips)?.name ?? thread.title}
              source={thread.source}
              size="mini"
            />
          </View>
        ))}
      </View>
      <View style={styles.awayText}>
        <Text variant="rowTitle">{copy.awayTitle(total)}</Text>
        <Text variant="helper" tone="muted">
          {copy.awayBody}
        </Text>
      </View>
      <ChevronRight size={iconSizes.back - 2} color={colors.textMuted} strokeWidth={strokes.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  missed: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    gap: 6,
  },
  missedTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellTile: {
    width: sizes.timelineTile,
    height: sizes.timelineTile,
    borderRadius: radii.tileSmall - 1,
    backgroundColor: colors.warningTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 2 },
  away: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.listCard,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  pressed: { opacity: 0.7 },
  faces: { flexDirection: 'row' },
  face: { borderWidth: 2, borderColor: colors.surface, borderRadius: radii.pill },
  faceOverlap: { marginLeft: -10 },
  awayText: { flex: 1, gap: 2 },
});
