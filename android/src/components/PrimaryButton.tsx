import { ArrowRight, type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { colors, iconSizes, radii, sizes, strokes } from '@/theme';

import { Text } from './Text';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  /** ArrowRight by default; Check for "Save home" and "Finish setup". */
  icon?: LucideIcon;
  disabled?: boolean;
  busy?: boolean;
  /** Gallery only: draw the pressed state. */
  previewPressed?: boolean;
};

export function PrimaryButton({
  label,
  onPress,
  icon: Icon = ArrowRight,
  disabled = false,
  busy = false,
  previewPressed = false,
}: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      style={({ pressed }) => [
        styles.button,
        (pressed || previewPressed) && !busy && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text variant="button" tone="onAccent">
        {label}
      </Text>
      <View style={styles.icon}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.bg} />
        ) : (
          <Icon size={iconSizes.button} color={colors.bg} strokeWidth={strokes.button} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    height: sizes.button,
    borderRadius: radii.button,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pressed: { backgroundColor: colors.accentPressed },
  disabled: { opacity: 0.4 },
  icon: {
    width: iconSizes.button,
    height: iconSizes.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
