import { Delete, Fingerprint } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, iconSizes, radii, sizes, strokes } from '@/theme';

import { Text } from './Text';

type KeypadProps = {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  /** Omit to leave the fingerprint cell empty (no stored biometric PIN). */
  onFingerprint?: () => void;
  disabled?: boolean;
  fingerprintLabel: string;
  deleteLabel: string;
};

const rows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

type KeyProps = {
  label: string;
  onPress: () => void;
  disabled: boolean;
  tone?: 'default' | 'accent';
  children: ReactNode;
};

function Key({ label, onPress, disabled, tone = 'default', children }: KeyProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.key,
        tone === 'accent' ? styles.accentKey : styles.defaultKey,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

/** 2.2 keypad: 3 columns, gap 12, keys 64 tall. Bottom row: fingerprint, 0, delete. */
export function Keypad({
  onDigit,
  onDelete,
  onFingerprint,
  disabled = false,
  fingerprintLabel,
  deleteLabel,
}: KeypadProps) {
  const digit = (d: string) => (
    <Key key={d} label={d} onPress={() => onDigit(d)} disabled={disabled}>
      <Text variant="key">{d}</Text>
    </Key>
  );

  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row[0]} style={styles.row}>
          {row.map(digit)}
        </View>
      ))}
      <View style={styles.row}>
        {onFingerprint ? (
          <Key label={fingerprintLabel} onPress={onFingerprint} disabled={disabled} tone="accent">
            <Fingerprint
              size={iconSizes.keyFingerprint}
              color={colors.accent}
              strokeWidth={strokes.icon}
            />
          </Key>
        ) : (
          <View style={styles.empty} />
        )}
        {digit('0')}
        <Key label={deleteLabel} onPress={onDelete} disabled={disabled}>
          <Delete size={iconSizes.keyDelete} color={colors.textSecondary} strokeWidth={strokes.icon} />
        </Key>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: sizes.keyGap, alignSelf: 'stretch' },
  row: { flexDirection: 'row', gap: sizes.keyGap },
  key: {
    flex: 1,
    height: sizes.keyHeight,
    borderRadius: radii.key,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultKey: { backgroundColor: colors.surface, borderColor: colors.border },
  accentKey: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  pressed: { backgroundColor: colors.surface2 },
  disabled: { opacity: 0.4 },
  empty: { flex: 1, height: sizes.keyHeight },
});
