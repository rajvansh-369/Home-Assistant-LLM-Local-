import { StyleSheet, View } from 'react-native';

import { colors, radii, sizes } from '@/theme';

import { Text } from './Text';

type CountBadgeProps = {
  count: number;
  /** `warning` for VIPs (4.1, 3.1) and the Messages tab; `neutral` for everyone else. */
  tone?: 'warning' | 'neutral';
  /** The tab bar's smaller badge. */
  small?: boolean;
};

/** An unread count: 4.1 rows, the 3.1 missed card and the Messages tab. */
export function CountBadge({ count, tone = 'warning', small = false }: CountBadgeProps) {
  const size = small ? sizes.tabBadge : sizes.countBadge;
  return (
    <View
      style={[
        styles.badge,
        { minWidth: size, height: size, paddingHorizontal: small ? 5 : 6 },
        tone === 'warning' ? styles.warning : styles.neutral,
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Text
        variant={small ? 'countSmall' : 'count'}
        tone={tone === 'warning' ? 'onAccent' : 'secondary'}
      >
        {count > 99 ? '99+' : String(count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  warning: { backgroundColor: colors.warning },
  neutral: { backgroundColor: colors.track },
});
