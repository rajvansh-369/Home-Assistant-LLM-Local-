import { Pressable, StyleSheet } from 'react-native';

import { colors, radii, sizes } from '@/theme';

import { Text } from './Text';

type SuggestionChipProps = { label: string; onPress: () => void; disabled?: boolean };

/** 3.1: a question to start a chat with. */
export function SuggestionChip({ label, onPress, disabled = false }: SuggestionChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text variant="chip" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: sizes.suggestionChip,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.surface2 },
  disabled: { opacity: 0.5 },
});
