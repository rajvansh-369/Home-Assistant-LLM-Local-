import { Pressable, StyleSheet } from 'react-native';

import { colors, sizes } from '@/theme';

import { Text } from './Text';

type TextLinkProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

export function TextLink({ label, onPress, disabled = false }: TextLinkProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[styles.link, disabled && styles.disabled]}
    >
      {({ pressed }) => (
        <Text
          variant="link"
          style={[styles.label, { color: pressed ? colors.text : colors.textSecondary }]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: sizes.textLink, alignItems: 'center', justifyContent: 'center' },
  // Large system text can wrap the label onto two lines.
  label: { textAlign: 'center' },
  disabled: { opacity: 0.4 },
});
