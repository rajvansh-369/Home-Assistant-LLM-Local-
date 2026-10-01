// 5.2 Memory and activity (docs/aster-profiles-memory-plan.md §4): every profile but Guest; Guest
// goes back to Settings, where the row isn't shown.
import { Redirect } from 'expo-router';

import { useFirstRunStore } from '@/features/first-run/store';
import { MemoryScreen } from '@/features/memory/MemoryScreen';
import { SessionGate } from '@/features/profiles/SessionGate';

function NotGuest() {
  const role = useFirstRunStore((state) => state.session?.profile.role);
  if (!role || role === 'guest') return <Redirect href="/settings" />;
  return <MemoryScreen />;
}

export default function Memory() {
  return (
    <SessionGate>
      <NotGuest />
    </SessionGate>
  );
}
