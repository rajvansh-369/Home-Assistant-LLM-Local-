// Temporary font check (Phase 0). Replaced by launch routing in Phase 2.
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { fonts } from '@/theme/fonts';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aster</Text>
      <Text style={styles.body}>Fonts are loaded.</Text>
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
  title: {
    fontFamily: fonts.display700,
    fontSize: 35,
    lineHeight: 38,
    letterSpacing: -0.7,
    color: colors.text,
    includeFontPadding: false,
  },
  body: {
    fontFamily: fonts.body400,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    includeFontPadding: false,
  },
});
