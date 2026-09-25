// 1.1 Welcome (plan §4.1). Welcome is the root: no back button, and Android back exits the app.
import { router } from 'expo-router';
import { Lock, MapPin, Server, Volume2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { AsterOrb, BrandMark, FeatureRow, PrimaryButton, Screen, Text } from '@/components';
import { welcome } from '@/features/first-run/copy';
import { sizes, spacing } from '@/theme';

const features = [
  { icon: Server, text: welcome.features.server },
  { icon: MapPin, text: welcome.features.home },
  { icon: Lock, text: welcome.features.lock },
  { icon: Volume2, text: welcome.features.voice },
];

export default function Welcome() {
  // The orb fills the leftover height (at most 190) and hides below 96.
  const [orbSize, setOrbSize] = useState(0);

  function onOrbAreaLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setOrbSize(Math.floor(Math.min(sizes.orb, width, height)));
  }

  return (
    <Screen variant="welcome" gap={0}>
      {/* Dev builds: long-press the brand mark to open the component gallery. */}
      {__DEV__ ? (
        <Pressable onLongPress={() => router.push('/dev/gallery')} style={styles.brand}>
          <BrandMark />
        </Pressable>
      ) : (
        <View style={styles.brand}>
          <BrandMark />
        </View>
      )}

      <View style={styles.orbArea} onLayout={onOrbAreaLayout}>
        {orbSize >= sizes.orbMin ? <AsterOrb size={orbSize} /> : null}
      </View>

      <Text variant="display" accessibilityRole="header">
        {welcome.headline}
      </Text>

      <View style={styles.features}>
        {features.map(({ icon, text }) => (
          <FeatureRow key={text} icon={icon} text={text} />
        ))}
      </View>

      <View style={styles.button}>
        <PrimaryButton label={welcome.cta} onPress={() => router.push('/sign-in')} />
      </View>
      <Text variant="helper" tone="muted" style={styles.caption}>
        {welcome.caption}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignSelf: 'flex-start' },
  orbArea: { flexGrow: 1, flexBasis: 0, alignItems: 'center', justifyContent: 'center' },
  features: { marginTop: spacing.welcomeRowsTop, gap: spacing.featureRowsApart },
  button: { marginTop: spacing.welcomeButtonTop },
  caption: { marginTop: spacing.welcomeCaptionTop, textAlign: 'center' },
});
