import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, iconSizes, radii, strokes } from '@/theme';

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
  /** 5.1 and 5.3 use neutral tiles; 1.3 the accent ones. */
  iconTone?: 'accent' | 'neutral';
};

export function ToggleRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled = false,
  iconTone = 'accent',
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
      <IconTile icon={icon} size={36} tone={iconTone} />
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

type LinkRowProps = {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Trailing text, e.g. "30 days". */
  value?: string;
  /** Without it the row is information only: no chevron, not pressable. */
  onPress?: () => void;
};

/** 5.1 / 5.3: a settings row that opens something, or just shows a fact. */
export function LinkRow({ icon, title, subtitle, value, onPress }: LinkRowProps) {
  const body = (
    <>
      <IconTile icon={icon} size={36} tone="neutral" />
      <View style={styles.text}>
        <Text variant="rowTitleToggle">{title}</Text>
        {subtitle ? (
          <Text variant="helper" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="bodySmall" tone="muted">
          {value}
        </Text>
      ) : null}
      {onPress ? (
        <ChevronRight size={iconSizes.search} color={colors.textMuted} strokeWidth={strokes.icon} />
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View
        style={styles.row}
        accessible
        accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={[subtitle, value].filter(Boolean).join(', ') || undefined}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {body}
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
