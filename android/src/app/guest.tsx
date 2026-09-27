// 2.5 Guest chat (docs/aster-home-chat-plan.md §4.3). The chat itself arrives in Phase H6; End (or
// Android back) locks the Guest session and returns to 2.1.
import { Redirect, useFocusEffect } from 'expo-router';
import { EyeOff, LogOut, User } from 'lucide-react-native';
import { useCallback } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InfoCallout, ScreenHeader, Text } from '@/components';
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { lockSession } from '@/features/profiles/actions';
import { guest as copy } from '@/features/profiles/copy';
import { colors, iconSizes, radii, sizes, spacing, strokes } from '@/theme';

function GuestAvatar() {
  return (
    <View
      style={styles.avatar}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <User size={iconSizes.status + 1} color={colors.textMuted} strokeWidth={strokes.icon} />
    </View>
  );
}

function EndButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={copy.end}
      style={({ pressed }) => [styles.end, pressed && styles.endPressed]}
    >
      <LogOut size={iconSizes.status} color={colors.text} strokeWidth={strokes.icon} />
      <Text variant="link">{copy.end}</Text>
    </Pressable>
  );
}

export default function Guest() {
  const session = useFirstRunStore((state) => state.session);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        lockSession();
        return true;
      });
      return () => subscription.remove();
    }, []),
  );

  if (!isUnlocked(session) || session!.profile.role !== 'guest') return <Redirect href="/who" />;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenHeader title={copy.title} subtitle={copy.subtitle} leading={<GuestAvatar />}>
        <EndButton onPress={lockSession} />
      </ScreenHeader>
      <View style={styles.callout}>
        <InfoCallout icon={EyeOff} tone="neutral" text={copy.callout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  avatar: {
    width: sizes.guestAvatar,
    height: sizes.guestAvatar,
    marginLeft: 4,
    marginRight: 8,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  end: {
    height: sizes.endPill,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,
    minWidth: sizes.touchTarget,
  },
  endPressed: { backgroundColor: colors.track },
  callout: { paddingHorizontal: spacing.chatX - 4, paddingTop: 4 },
});
