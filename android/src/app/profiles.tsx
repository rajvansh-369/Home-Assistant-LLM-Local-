// 2.3 Profiles (docs/aster-profiles-memory-plan.md §4): the Owner only; anyone else goes back to
// Settings, where the row isn't shown.
import { Redirect } from 'expo-router';

import { useFirstRunStore } from '@/features/first-run/store';
import { ProfilesScreen } from '@/features/profiles/ProfilesScreen';
import { SessionGate } from '@/features/profiles/SessionGate';

function OwnerOnly() {
  const role = useFirstRunStore((state) => state.session?.profile.role);
  if (role !== 'owner') return <Redirect href="/settings" />;
  return <ProfilesScreen />;
}

export default function Profiles() {
  return (
    <SessionGate>
      <OwnerOnly />
    </SessionGate>
  );
}
