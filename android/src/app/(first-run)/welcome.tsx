// 1.1 Welcome. Phase 2 placeholder; Phase 3 builds the full screen (plan §4.1).
// Welcome is the root: no back button, and Android back exits the app.
import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { BrandMark, PrimaryButton, Screen, Text } from '@/components';
import { welcome } from '@/features/first-run/copy';

export default function Welcome() {
  return (
    <Screen
      variant="welcome"
      footer={<PrimaryButton label={welcome.cta} onPress={() => router.push('/sign-in')} />}
    >
      {/* Dev builds: long-press the brand mark to open the component gallery. */}
      <Pressable onLongPress={__DEV__ ? () => router.push('/dev/gallery') : undefined}>
        <BrandMark />
      </Pressable>
      <Text variant="display" accessibilityRole="header">
        {welcome.headline}
      </Text>
    </Screen>
  );
}
