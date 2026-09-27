// "Lock when I leave" (docs/aster-home-chat-plan.md §1): after the profile's auto_lock_minutes in
// the background, or once its token has expired, coming back locks the session. The screens'
// session guards then return to 2.1. Not armed during first run (first-run plan §5).
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useFirstRunStore } from '@/features/first-run/store';

import { lockSession, shouldLock } from './actions';

export function useAutoLock() {
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        backgroundedAt.current ??= Date.now();
        return;
      }
      if (next !== 'active') return;
      const { session, firstRunDone } = useFirstRunStore.getState();
      if (firstRunDone && shouldLock(session, backgroundedAt.current)) lockSession();
      backgroundedAt.current = null;
    });
    return () => subscription.remove();
  }, []);
}
