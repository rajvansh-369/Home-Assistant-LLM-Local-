import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { colors, iconSizes, radii, sizes, strokes } from '@/theme';

type IconButtonProps = {
  icon: LucideIcon;
  /** Read by TalkBack; the button has no visible text. */
  label: string;
  onPress: () => void;
  /** `plain` (header actions) or `filled` (surface2 circle with a border). */
  variant?: 'plain' | 'filled';
  disabled?: boolean;
  iconColor?: string;
  selected?: boolean;
};

/** A 44 round icon button (3.3 and 3.4 headers, the composer). */
export function IconButton({
  icon: Icon,
  label,
  onPress,
  variant = 'plain',
  disabled = false,
  iconColor = colors.textSecondary,
  selected,
}: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      style={({ pressed }) => [
        styles.button,
        variant === 'filled' && styles.filled,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon size={iconSizes.headerAction} color={iconColor} strokeWidth={strokes.icon} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.track },
  disabled: { opacity: 0.5 },
});
