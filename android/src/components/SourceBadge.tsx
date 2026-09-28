import { StyleSheet, View } from 'react-native';

import { colors, radii, sizes } from '@/theme';

import { Text } from './Text';

/** 4.1 and 3.1: the app a message came from ("WhatsApp"), in mono caps on the track fill. */
export function SourceBadge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text variant="badge" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: sizes.sourceBadge,
    paddingHorizontal: 7,
    borderRadius: radii.badge,
    backgroundColor: colors.track,
    borderWidth: 1,
    borderColor: colors.track,
    justifyContent: 'center',
    flexShrink: 0,
  },
});
