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

import { installChatSession } from '@/features/chat/actions';
import { bootFirstRun } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { useHomeMode } from '@/features/home-mode/useHomeMode';
import { useAutoLock } from '@/features/profiles/useAutoLock';
import { installReminders } from '@/features/reminders/install';
import { syncHomeGeofence } from '@/services/geofence';
// Defines the background tasks at module scope, so they exist when Android wakes the app (plan §7,
// reminders plan §6).
import '@/tasks/geofence-task';
import { registerNotificationTask } from '@/tasks/notification-task';
import { colors } from '@/theme/colors';
import { fontAssets } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync();
installChatSession();
SystemUI.setBackgroundColorAsync(colors.bg);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const booted = useFirstRunStore((state) => state.booted);
  const ready = (fontsLoaded || fontError != null) && booted;
  useAutoLock();
  useHomeMode();

  useEffect(() => {
    // If storage can't be read, start as a fresh install rather than hang on the splash screen.
    bootFirstRun()
      // Geofences may not survive a reboot or an update: register again while allowed (§7).
      .then(() => syncHomeGeofence(useFirstRunStore.getState().home).catch(() => false))
      .catch(() => useFirstRunStore.getState().set({ booted: true }))
      .finally(() => {
        void registerNotificationTask();
        installReminders(() => {});
      });
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
            <Stack.Screen name="who" />
            <Stack.Screen name="unlock/[id]" />
            <Stack.Screen name="guest" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="chat/[id]" />
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
