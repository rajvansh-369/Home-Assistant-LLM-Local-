// Temporary font check (Phase 0). Replaced by launch routing in Phase 2.
// In dev builds, long-press the wordmark to open the component gallery.
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { common } from '@/features/first-run/copy';
import { colors } from '@/theme';

export default function Index() {
  return (
    <View style={styles.container}>
      <Pressable onLongPress={__DEV__ ? () => router.push('/dev/gallery') : undefined}>
        <Text variant="display">{common.brand}</Text>
      </Pressable>
      <Text variant="body" tone="secondary">
        Fonts are loaded.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.bg,
  },
});
