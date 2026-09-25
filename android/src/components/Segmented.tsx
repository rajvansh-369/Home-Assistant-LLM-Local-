import { Pressable, StyleSheet, View } from 'react-native';

import { colors, hitSlopFor, radii, sizes } from '@/theme';

import { Text } from './Text';

export type SegmentedOption<T extends string | number> = { value: T; label: string };

type SegmentedProps<T extends string | number> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Screen-reader label for the group, e.g. "Home area". */
  label: string;
};

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: SegmentedProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            hitSlop={hitSlopFor(sizes.segmentItem)}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            style={[styles.item, selected ? styles.itemSelected : styles.itemIdle]}
          >
            <Text variant="link" tone={selected ? 'accent' : 'secondary'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radii.segmentTrack,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  item: {
    flex: 1,
    minHeight: sizes.segmentItem,
    borderRadius: radii.segmentItem,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemSelected: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  itemIdle: { backgroundColor: colors.transparent, borderColor: colors.transparent },
});
