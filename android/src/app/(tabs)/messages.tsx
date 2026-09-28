// 4.1 Messages (docs/aster-messages-alerts-plan.md §3): the Owner's tab. Anyone else, arriving by
// a link, goes to Home, where the tab isn't shown.
import { Redirect } from 'expo-router';

import { useFirstRunStore } from '@/features/first-run/store';
import { MessagesScreen } from '@/features/messages/MessagesScreen';

export default function Messages() {
  const role = useFirstRunStore((state) => state.session?.profile.role);
  if (role !== 'owner') return <Redirect href="/home" />;
  return <MessagesScreen />;
}
