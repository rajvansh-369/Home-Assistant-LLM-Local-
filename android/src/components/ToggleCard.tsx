import type { LucideIcon } from 'lucide-react-native';
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii } from '@/theme';

import { IconTile } from './IconTile';
import { SwitchTrack } from './Switch';
import { Text } from './Text';

export function ToggleCard({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View style={styles.card}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={styles.divider} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

type ToggleRowProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

export function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled = false,
}: ToggleRowProps) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <IconTile icon={icon} size={36} />
      <View style={styles.text}>
        <Text variant="rowTitleToggle">{title}</Text>
        {subtitle ? (
          <Text variant="helper" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <SwitchTrack value={value} disabled={disabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.toggleCard,
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowPressed: { backgroundColor: colors.surface2 },
  text: { flex: 1, gap: 2 },
});
