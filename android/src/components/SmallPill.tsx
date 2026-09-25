import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { colors, hitSlopFor, iconSizes, radii, sizes, strokes } from '@/theme';

import { Text } from './Text';

type SmallPillProps = {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  /** A spinner replaces the icon and presses are ignored. */
  busy?: boolean;
  disabled?: boolean;
};

export function SmallPill({ label, icon: Icon, onPress, busy = false, disabled = false }: SmallPillProps) {
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      disabled={disabled}
      hitSlop={hitSlopFor(sizes.smallPill)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [styles.pill, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {busy ? (
        <ActivityIndicator size={iconSizes.pill} color={colors.textSecondary} />
      ) : (
        <Icon size={iconSizes.pill} color={colors.textSecondary} strokeWidth={strokes.icon} />
      )}
      <Text variant="chip" tone="secondary">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: sizes.smallPill,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pressed: { borderColor: colors.borderStrong },
  disabled: { opacity: 0.4 },
});
