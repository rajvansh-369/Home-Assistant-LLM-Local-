// 5.3 Location (docs/aster-reminders-location-plan.md §3): the Owner only; anyone else goes back to
// Settings, where the row isn't shown.
import { Redirect } from 'expo-router';

import { useFirstRunStore } from '@/features/first-run/store';
import { LocationScreen } from '@/features/location/LocationScreen';
import { SessionGate } from '@/features/profiles/SessionGate';

function OwnerOnly() {
  const role = useFirstRunStore((state) => state.session?.profile.role);
  if (role !== 'owner') return <Redirect href="/settings" />;
  return <LocationScreen />;
}

export default function Location() {
  return (
    <SessionGate>
      <OwnerOnly />
    </SessionGate>
  );
}
