// Home mode runs once first run is done (docs/aster-home-chat-plan.md §5).
import { useEffect } from 'react';

import { useFirstRunStore } from '@/features/first-run/store';

import { startHomeMode } from './controller';

export function useHomeMode() {
  const firstRunDone = useFirstRunStore((state) => state.firstRunDone);
  useEffect(() => (firstRunDone ? startHomeMode() : undefined), [firstRunDone]);
}
