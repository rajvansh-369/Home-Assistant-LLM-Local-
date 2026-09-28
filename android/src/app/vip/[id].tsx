// The VIP contact editor (docs/aster-messages-alerts-plan.md §3): `new`, or a VIP contact's id. The
// Owner only.
import { Redirect, useLocalSearchParams } from 'expo-router';

import { useFirstRunStore } from '@/features/first-run/store';
import { VipEditor } from '@/features/messages/VipEditor';
import { SessionGate } from '@/features/profiles/SessionGate';

function OwnerOnly({ id }: { id: string }) {
  const role = useFirstRunStore((state) => state.session?.profile.role);
  if (role !== 'owner') return <Redirect href="/settings" />;
  const number = Number(id);
  return <VipEditor id={id === 'new' || !Number.isInteger(number) ? null : number} />;
}

export default function Vip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SessionGate>
      <OwnerOnly id={id} />
    </SessionGate>
  );
}
