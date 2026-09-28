// The signed-in app: Home, Chats, Messages and Settings behind the 3.1 tab bar
// (docs/aster-home-chat-plan.md §2). Messages is the Owner's (docs/aster-messages-alerts-plan.md
// §3 4.1), with a badge for unread VIP messages; everyone else sees three tabs.
import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import { useAlertsStore } from '@/features/messages/alerts';
import { useThreadsStore } from '@/features/messages/threads';
import { unreadVipCount } from '@/features/messages/vip';
import { SessionGate } from '@/features/profiles/SessionGate';
import { colors } from '@/theme';

function useVipBadge(): number {
  const threads = useThreadsStore((state) => state.threads);
  const vips = useAlertsStore((state) => state.vips);
  return threads.reduce((sum, thread) => sum + unreadVipCount(thread, vips), 0);
}

export default function TabsLayout() {
  const owner = useFirstRunStore((state) => state.session?.profile.role === 'owner');
  const badge = useVipBadge();
  return (
    <SessionGate>
      <Tabs
        tabBar={(props) => (
          <TabBar
            {...props}
            hidden={owner ? [] : ['messages']}
            badges={{ messages: owner ? badge : 0 }}
          />
        )}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="chats" />
        <Tabs.Screen name="messages" />
        <Tabs.Screen name="settings" />
      </Tabs>
    </SessionGate>
  );
}
