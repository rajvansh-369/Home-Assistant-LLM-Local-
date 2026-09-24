import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { bootFirstRun } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { colors } from '@/theme/colors';
import { fontAssets } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync();
SystemUI.setBackgroundColorAsync(colors.bg);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const booted = useFirstRunStore((state) => state.booted);
  const ready = (fontsLoaded || fontError != null) && booted;

  useEffect(() => {
    // If storage can't be read, start as a fresh install rather than hang on the splash screen.
    bootFirstRun().catch(() => useFirstRunStore.getState().set({ booted: true }));
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            {/* index only resolves launch routing and replaces itself (plan §5). */}
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="(first-run)" />
            <Stack.Screen name="home" />
            <Stack.Screen name="dev/gallery" />
          </Stack>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
