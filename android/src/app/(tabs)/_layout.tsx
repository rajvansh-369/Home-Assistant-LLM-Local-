// The signed-in app: Home, Chats and Settings behind the 3.1 tab bar (docs/aster-home-chat-plan.md
// §2). Messages joins when the Messages step is built.
import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components';
import { SessionGate } from '@/features/profiles/SessionGate';
import { colors } from '@/theme';

export default function TabsLayout() {
  return (
    <SessionGate>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="chats" />
        <Tabs.Screen name="settings" />
      </Tabs>
    </SessionGate>
  );
}
