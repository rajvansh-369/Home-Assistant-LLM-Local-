// 2.4 Edit profile (docs/aster-profiles-memory-plan.md §4): `new`, or a Member's or Restricted
// profile's id. The Owner only.
import { Redirect, useLocalSearchParams } from 'expo-router';

import { useFirstRunStore } from '@/features/first-run/store';
import { ProfileEditor } from '@/features/profiles/ProfileEditor';
import { SessionGate } from '@/features/profiles/SessionGate';

function OwnerOnly({ id }: { id: string }) {
  const role = useFirstRunStore((state) => state.session?.profile.role);
  if (role !== 'owner') return <Redirect href="/settings" />;
  const number = Number(id);
  return <ProfileEditor id={id === 'new' || !Number.isInteger(number) ? null : number} />;
}

export default function EditProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <SessionGate>
      <OwnerOnly id={id} />
    </SessionGate>
  );
}
