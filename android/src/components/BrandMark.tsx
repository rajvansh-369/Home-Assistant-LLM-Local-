import { StyleSheet, View } from 'react-native';

import { common } from '@/features/first-run/copy';
import { orbColors, radii, sizes } from '@/theme';

import { OrbSphere } from './OrbSphere';
import { Text } from './Text';

const brandStops = [
  { offset: 0, color: orbColors.brandStart },
  { offset: 0.42, color: orbColors.mid },
  { offset: 1, color: orbColors.end },
] as const;

export function BrandMark() {
  return (
    <View style={styles.row}>
      <View
        style={styles.orb}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <OrbSphere size={sizes.brandOrb} cx={0.35} cy={0.3} stops={brandStops} />
      </View>
      <Text variant="wordmark" accessibilityRole="header">
        {common.brand}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orb: {
    width: sizes.brandOrb,
    height: sizes.brandOrb,
    borderRadius: radii.pill,
    boxShadow: `0 0 13px ${orbColors.brandGlow}`,
  },
});
