// 4.3 Spoken alerts (docs/aster-messages-alerts-plan.md §3): the Owner only; anyone else goes back
// to Settings, where the row isn't shown.
import { Redirect } from 'expo-router';

import { useFirstRunStore } from '@/features/first-run/store';
import { AlertsScreen } from '@/features/messages/AlertsScreen';
import { SessionGate } from '@/features/profiles/SessionGate';

function OwnerOnly() {
  const role = useFirstRunStore((state) => state.session?.profile.role);
  if (role !== 'owner') return <Redirect href="/settings" />;
  return <AlertsScreen />;
}

export default function Alerts() {
  return (
    <SessionGate>
      <OwnerOnly />
    </SessionGate>
  );
}
