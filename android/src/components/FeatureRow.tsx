import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';

import { IconTile } from './IconTile';
import { Text } from './Text';

type FeatureRowProps = { icon: LucideIcon; text: string };

export function FeatureRow({ icon, text }: FeatureRowProps) {
  return (
    <View style={styles.row}>
      <IconTile icon={icon} size={36} />
      <Text variant="body" tone="secondary" style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.featureRowGap },
  text: { flex: 1, paddingTop: 7 },
});
