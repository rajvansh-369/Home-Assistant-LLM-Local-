// Screens that need an unlocked profile (docs/aster-home-chat-plan.md §2): without one, back to
// 2.1; Guest only ever sees 2.5.
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';

export function SessionGate({ children }: { children: ReactNode }) {
  const session = useFirstRunStore((state) => state.session);
  if (!isUnlocked(session)) return <Redirect href="/who" />;
  if (session!.profile.role === 'guest') return <Redirect href="/guest" />;
  return children;
}
