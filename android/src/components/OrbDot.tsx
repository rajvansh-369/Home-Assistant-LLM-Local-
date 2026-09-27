import { StyleSheet, View } from 'react-native';

import { orbColors, radii } from '@/theme';

import { OrbSphere } from './OrbSphere';

const stops = [
  { offset: 0, color: orbColors.brandStart },
  { offset: 0.42, color: orbColors.mid },
  { offset: 1, color: orbColors.end },
] as const;

type OrbDotProps = {
  /** 24 beside answers (3.4), 48 on 2.1. */
  size: number;
};

/** The small glowing orb: the assistant's avatar in chats and the 2.1 mark. Decorative. */
export function OrbDot({ size }: OrbDotProps) {
  return (
    <View
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          boxShadow: `0 0 ${Math.round(size * 0.6)}px ${orbColors.brandGlow}`,
        },
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <OrbSphere size={size} cx={0.35} cy={0.3} stops={stops} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: { borderRadius: radii.pill, flexShrink: 0 },
});
