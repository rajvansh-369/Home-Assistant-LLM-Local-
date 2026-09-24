import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors, iconSizes, radii, strokes } from '@/theme';

import { Text } from './Text';

type InfoCalloutProps = { icon: LucideIcon; text: string };

export function InfoCallout({ icon: Icon, text }: InfoCalloutProps) {
  return (
    <View style={styles.callout}>
      <Icon size={iconSizes.callout} color={colors.accent} strokeWidth={strokes.icon} />
      <Text variant="bodySmall" style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  callout: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.callout,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentTint,
  },
  text: { flex: 1 },
});
