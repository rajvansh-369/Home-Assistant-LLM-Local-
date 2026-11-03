import { useFonts } from 'expo-font';
import type * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
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
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { useHomeMode } from '@/features/home-mode/useHomeMode';
import { installLocation } from '@/features/location/install';
import { installMessages } from '@/features/messages/install';
import { handleNoticeResponse } from '@/features/messages/notify';
import { useAutoLock } from '@/features/profiles/useAutoLock';
import { installReminders } from '@/features/reminders/install';
import { useRemindersStore } from '@/features/reminders/store';
import { syncHomeGeofence } from '@/services/geofence';
// Defines the background tasks at module scope, so they exist when Android wakes the app (plan §7,
// reminders plan §6).
import '@/tasks/geofence-task';
import '@/tasks/location-task';
import { registerNotificationTask } from '@/tasks/notification-task';
import { colors } from '@/theme/colors';
import { fontAssets } from '@/theme/fonts';

SplashScreen.preventAutoHideAsync();

/** A tap on a reminder's notification opens it, when its profile is the one unlocked. */
function openReminder(clientUuid: string) {
  const { session } = useFirstRunStore.getState();
  const reminder = useRemindersStore.getState().reminders[clientUuid];
  if (!isUnlocked(session) || reminder?.profileId !== session!.profile.id) return;
  router.push({ pathname: '/reminder/[id]', params: { id: clientUuid } });
}
/** "Catch me up" or a tap on Welcome home opens 4.1; the server notice's Settings opens 5.1. */
function openNotice(response: Notifications.NotificationResponse) {
  void handleNoticeResponse(response).then((route) => {
    if (route && isUnlocked(useFirstRunStore.getState().session)) router.navigate(route);
  });
}
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
        installReminders(openReminder, openNotice);
        installLocation();
        installMessages();
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
            <Stack.Screen name="voice" options={{ animation: 'fade' }} />
            <Stack.Screen name="reminder/[id]" />
            <Stack.Screen name="location" />
            <Stack.Screen name="thread/[key]" />
            <Stack.Screen name="alerts" />
            <Stack.Screen name="vip/[id]" />
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
