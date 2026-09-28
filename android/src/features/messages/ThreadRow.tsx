// A 4.1 / 3.1 thread row (docs/aster-messages-alerts-plan.md §3): avatar, name, the app's badge,
// time, the last message (a one-time code stays hidden), "Read aloud at 8:02 PM" when Aster spoke
// it, and the unread count (warning for VIPs).
import { router } from 'expo-router';
import { MessageSquare, Volume2 } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, CountBadge, SourceBadge, Text } from '@/components';
import { colors, iconSizes, radii, sizes, strokes } from '@/theme';

import type { CapturedThread, MessageSource } from '../../../modules/aster-system';

import { messages as copy, sources } from './copy';
import { clock, hasInitial, listTime, nameColor } from './format';

type SenderAvatarProps = {
  name: string;
  source: MessageSource;
  size?: 'row' | 'thread' | 'mini';
};

const DIAMETER = { row: sizes.rowAvatar, thread: sizes.threadAvatar, mini: sizes.miniAvatar };

/** A person's initial on a swatch picked by name; numbers and sender codes get a message icon. */
export function SenderAvatar({ name, source, size = 'row' }: SenderAvatarProps) {
  if (hasInitial(name, source)) return <Avatar color={nameColor(name)} name={name} size={size} />;
  const diameter = DIAMETER[size];
  return (
    <View
      style={[styles.iconAvatar, { width: diameter, height: diameter }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <MessageSquare
        size={iconSizes.search}
        color={colors.textSecondary}
        strokeWidth={strokes.icon}
      />
    </View>
  );
}

/** The last message as a one-line preview; group chats name the sender. */
export function previewOf(thread: CapturedThread): string {
  const { last } = thread;
  const text = last.otp ? copy.otpHidden : last.text.replace(/\s+/g, ' ');
  return thread.isGroup && !last.outgoing && last.sender ? `${last.sender}: ${text}` : text;
}

type ThreadRowProps = {
  thread: CapturedThread;
  vip: boolean;
  /** Unread messages to count: every one, or only VIPs' (3.1). */
  unread: number;
  now: Date;
  /** 3.1 quotes the last message. */
  quoted?: boolean;
  first?: boolean;
};

export function ThreadRow({
  thread,
  vip,
  unread,
  now,
  quoted = false,
  first = false,
}: ThreadRowProps) {
  const time = listTime(thread.last.at, now);
  const source = sources[thread.source];
  const title = thread.title || copy.noName;
  const preview = previewOf(thread);
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/thread/[key]', params: { key: thread.key } })}
      accessibilityRole="button"
      accessibilityLabel={copy.rowLabel(title, source, time, unread)}
      accessibilityHint={preview}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}
    >
      <SenderAvatar name={title} source={thread.source} />
      <View style={styles.text}>
        <View style={styles.titleLine}>
          <Text variant="rowTitle" numberOfLines={1} style={styles.name}>
            {title}
          </Text>
          <SourceBadge label={source} />
          <Text variant="monoSmall" tone="muted" style={styles.time}>
            {time}
          </Text>
        </View>
        <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
          {quoted && !thread.last.otp ? `“${preview}”` : preview}
        </Text>
        {vip && thread.spokenAt != null ? (
          <View style={styles.spoken}>
            <Volume2 size={iconSizes.marker} color={colors.warning} strokeWidth={strokes.icon} />
            <Text variant="marker" tone="warning">
              {copy.readAloudAt(clock(thread.spokenAt))}
            </Text>
          </View>
        ) : null}
      </View>
      {unread > 0 ? <CountBadge count={unread} tone={vip ? 'warning' : 'neutral'} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { opacity: 0.7 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1 },
  time: { marginLeft: 'auto' },
  spoken: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  iconAvatar: {
    borderRadius: radii.pill,
    backgroundColor: colors.track,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
