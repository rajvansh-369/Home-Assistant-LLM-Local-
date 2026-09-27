import { CloudOff } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, iconSizes, strokes } from '@/theme';

import { Text } from './Text';

type ConversationRowProps = {
  title: string;
  /** "7:58 PM", "Tue" or "15 Sep". */
  time: string;
  /** First line of the last answer. */
  preview?: string;
  onPress: () => void;
  onLongPress?: () => void;
  /** Not on the server yet: a small cloud-off mark with this label. */
  pendingLabel?: string;
  first?: boolean;
};

/** 3.3: one chat in a day group. */
export function ConversationRow({
  title,
  time,
  preview,
  onPress,
  onLongPress,
  pendingLabel,
  first,
}: ConversationRowProps) {
  const label = [title, time, preview, pendingLabel].filter(Boolean).join(', ');
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, !first && styles.divided, pressed && styles.pressed]}
    >
      <View style={styles.top}>
        <Text variant="rowTitle" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {pendingLabel ? (
          <CloudOff size={iconSizes.source} color={colors.textMuted} strokeWidth={strokes.icon} />
        ) : null}
        <Text variant="monoSmall" tone="muted">
          {time}
        </Text>
      </View>
      {preview ? (
        <Text variant="bodySmall" tone="secondary" numberOfLines={1}>
          {preview}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 12, paddingHorizontal: 16, gap: 3 },
  divided: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.surface2 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1 },
});
