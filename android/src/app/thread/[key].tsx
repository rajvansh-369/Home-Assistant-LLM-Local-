// 4.2 Thread (docs/aster-messages-alerts-plan.md §3): one captured chat, by its key. Also opened by
// the missed-message notification (aster://thread/{key}). The Owner only.
import { Redirect, useLocalSearchParams } from 'expo-router';

import { useFirstRunStore } from '@/features/first-run/store';
import { ThreadView } from '@/features/messages/ThreadView';
import { SessionGate } from '@/features/profiles/SessionGate';

function OwnerOnly({ threadKey }: { threadKey: string }) {
  const role = useFirstRunStore((state) => state.session?.profile.role);
  if (role !== 'owner') return <Redirect href="/home" />;
  return <ThreadView threadKey={threadKey} />;
}

export default function Thread() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return (
    <SessionGate>
      <OwnerOnly threadKey={key} />
    </SessionGate>
  );
}
