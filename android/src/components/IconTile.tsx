import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors, iconSizes, radii, sizes, strokes } from '@/theme';

type IconTileProps = {
  icon: LucideIcon;
  size?: 36 | 40;
  tone?: 'accent' | 'neutral';
};

export function IconTile({ icon: Icon, size = 36, tone = 'accent' }: IconTileProps) {
  const small = size === sizes.iconTileSmall;
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: small ? radii.tileSmall : radii.tileLarge,
          backgroundColor: tone === 'accent' ? colors.accentTint : colors.surface2,
        },
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Icon
        size={small ? iconSizes.tileSmall : iconSizes.tileLarge}
        color={tone === 'accent' ? colors.accent : colors.textSecondary}
        strokeWidth={strokes.icon}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
});
