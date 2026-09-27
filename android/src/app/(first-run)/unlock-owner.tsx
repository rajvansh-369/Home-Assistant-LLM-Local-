// 2.2 Unlock, first-run mode (plan §4.6): used when sign-in finds an existing Owner, or after a
// restart once the Owner exists but home isn't saved. No step header; back returns to 1.2.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import { unlockOwner } from '@/features/first-run/actions';
import { unlock as copy } from '@/features/first-run/copy';
import type { FirstRunRoute } from '@/features/first-run/routing';
import { useFirstRunStore } from '@/features/first-run/store';
import { useStepBack } from '@/features/first-run/useStepBack';
import { UnlockView } from '@/features/profiles/UnlockView';

export default function UnlockOwner() {
  const onBack = useStepBack('/sign-in');
  const owner = useFirstRunStore((state) => state.owner);
  const fingerprintEnabled = useFirstRunStore((state) => state.fingerprintEnabled);
  const next = useRef<FirstRunRoute>('/set-home');

  useFocusEffect(
    useCallback(() => {
      if (!useFirstRunStore.getState().owner) router.replace('/sign-in');
    }, []),
  );

  const unlock = useCallback(async (pin: string) => {
    next.current = await unlockOwner(pin);
  }, []);

  return (
    <UnlockView
      name={owner?.name ?? ''}
      color={owner?.color ?? 'mint'}
      badge={copy.ownerBadge}
      onBack={onBack}
      unlock={unlock}
      onUnlocked={() => router.push(next.current)}
      onSignedOut={() => router.replace('/sign-in')}
      fingerprint={fingerprintEnabled}
    />
  );
}
