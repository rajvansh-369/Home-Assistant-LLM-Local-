// 2.5 Guest chat (docs/aster-home-chat-plan.md §4.3): a chat with memory and web off that is never
// kept or uploaded. End (or Android back) locks the Guest session and returns to 2.1, and the chat
// is gone with the screen.
import { Redirect, router, useFocusEffect } from 'expo-router';
import { EyeOff, LogOut, User } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';

import { InfoCallout, ScreenHeader, Text } from '@/components';
import { ChatView } from '@/features/chat/ChatView';
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { lockSession } from '@/features/profiles/actions';
import { guest as copy } from '@/features/profiles/copy';
import { colors, iconSizes, radii, sizes, strokes } from '@/theme';

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
  const [ending, setEnding] = useState(false);

  const end = useCallback(() => {
    setEnding(true);
    lockSession();
    if (router.canGoBack()) router.back();
    else router.replace('/who');
  }, []);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        end();
        return true;
      });
      return () => subscription.remove();
    }, [end]),
  );

  if (!isUnlocked(session) || session!.profile.role !== 'guest') {
    return ending ? null : <Redirect href="/who" />;
  }

  return (
    <ChatView
      mode="guest"
      chatUuid={null}
      placeholder={copy.placeholder}
      banner={<InfoCallout icon={EyeOff} tone="neutral" text={copy.callout} />}
      header={() => (
        <ScreenHeader title={copy.title} subtitle={copy.subtitle} leading={<GuestAvatar />}>
          <EndButton onPress={end} />
        </ScreenHeader>
      )}
    />
  );
}

const styles = StyleSheet.create({
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
});
