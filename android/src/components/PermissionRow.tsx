import { Check, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { common } from '@/features/first-run/copy';
import {
  colors,
  hitSlopFor,
  iconSizes,
  maxFontSizeMultiplier,
  radii,
  sizes,
  strokes,
} from '@/theme';

import { IconTile } from './IconTile';
import { Text } from './Text';

type AllowPillProps = {
  /** The row title, for the screen-reader label "Allow {title}". */
  title: string;
  onPress: () => void;
  /** Disabled while a system screen is open. */
  disabled?: boolean;
};

export function AllowPill({ title, onPress, disabled = false }: AllowPillProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlopFor(sizes.allowPill)}
      accessibilityRole="button"
      accessibilityLabel={common.allowFor(title)}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed, disabled && styles.disabled]}
    >
      <Text variant="link" tone="accent">
        {common.allow}
      </Text>
    </Pressable>
  );
}

/** The row's label already says "Allowed", so the chip is hidden from screen readers. */
export function AllowedChip() {
  return (
    <View
      style={styles.chip}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Check size={iconSizes.chip} color={colors.accent} strokeWidth={strokes.check} />
      <Text variant="chip" tone="accent">
        {common.allowed}
      </Text>
    </View>
  );
}

type PermissionRowProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  allowed: boolean;
  onAllow: () => void;
  allowDisabled?: boolean;
  /** A follow-up line under the description, e.g. how to get past "Restricted setting". */
  note?: string;
};

export function PermissionRow({
  icon,
  title,
  description,
  allowed,
  onAllow,
  allowDisabled = false,
  note,
}: PermissionRowProps) {
  // Large system text: the pill would squeeze the title until words break, so it moves under
  // the text instead.
  const stacked = useWindowDimensions().fontScale > maxFontSizeMultiplier;
  return (
    <View style={[styles.row, stacked && styles.rowStacked]}>
      <View style={[styles.main, !stacked && styles.mainFill]}>
        <IconTile icon={icon} size={40} tone="neutral" />
        <View
          style={styles.text}
          accessible
          accessibilityLabel={allowed ? `${title}, ${common.allowed}` : title}
          accessibilityHint={note ? `${description} ${note}` : description}
        >
          <Text variant="rowTitle">{title}</Text>
          <Text variant="helper" tone="muted">
            {description}
          </Text>
          {note ? (
            <Text variant="helper" tone="warning" accessibilityLiveRegion="polite">
              {note}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={stacked && styles.controlStacked}>
        {allowed ? (
          <AllowedChip />
        ) : (
          <AllowPill title={title} onPress={onAllow} disabled={allowDisabled} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingTop: 14,
    paddingRight: 14,
    paddingBottom: 14,
    paddingLeft: 16,
    borderRadius: radii.permissionRow,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowStacked: { flexDirection: 'column', alignItems: 'stretch' },
  main: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  mainFill: { flex: 1 },
  text: { flex: 1, gap: 2 },
  // Under the text, past the icon tile.
  controlStacked: { alignSelf: 'flex-start', marginLeft: sizes.iconTileLarge + 14 },
  pill: {
    minHeight: sizes.allowPill,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.transparent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillPressed: { backgroundColor: colors.accentTint },
  disabled: { opacity: 0.4 },
  chip: {
    minHeight: sizes.allowedChip,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.accentTint,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
});
