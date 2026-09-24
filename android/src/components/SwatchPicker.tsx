import { Pressable, StyleSheet, View } from 'react-native';

import { common } from '@/features/first-run/copy';
import { colors, hitSlopFor, profileColors, radii, sizes, type ProfileColor } from '@/theme';

const swatchOrder = Object.keys(profileColors) as ProfileColor[];

// Canvas: box-shadow: 0 0 0 3px bg, 0 0 0 5px text.
const selectedRing = `0 0 0 ${sizes.swatchRingGap}px ${colors.bg}, 0 0 0 ${
  sizes.swatchRingGap + sizes.swatchRingWidth
}px ${colors.text}`;

type SwatchPickerProps = {
  value: ProfileColor;
  onChange: (value: ProfileColor) => void;
};

export function SwatchPicker({ value, onChange }: SwatchPickerProps) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={common.profileColour}>
      {swatchOrder.map((key) => {
        const selected = key === value;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            hitSlop={hitSlopFor(sizes.swatch)}
            accessibilityRole="radio"
            accessibilityLabel={common.colourNames[key]}
            accessibilityState={{ checked: selected }}
            style={[
              styles.swatch,
              { backgroundColor: profileColors[key] },
              selected && { boxShadow: selectedRing },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: sizes.swatchGap, paddingLeft: 4 },
  swatch: { width: sizes.swatch, height: sizes.swatch, borderRadius: radii.pill },
});
