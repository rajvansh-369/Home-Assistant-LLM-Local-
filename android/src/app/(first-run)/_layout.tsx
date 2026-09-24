import { Stack } from 'expo-router';

import { colors } from '@/theme';

// Forward moves push and slide in from the right. A back move that has to replace the screen
// (after a resume, plan §5) animates as a pop.
export default function FirstRunLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        animationTypeForReplace: 'pop',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="create-owner" />
      <Stack.Screen name="unlock-owner" />
      <Stack.Screen name="set-home" />
      <Stack.Screen name="permissions" />
    </Stack>
  );
}
