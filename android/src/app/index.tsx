// Launch routing (plan §5): resolve where first run stands and replace this route with it.
import { Redirect } from 'expo-router';

import { resolveFirstRunRoute } from '@/features/first-run/routing';
import { firstRunFacts, useFirstRunStore } from '@/features/first-run/store';

export default function Index() {
  const route = useFirstRunStore((state) =>
    state.booted ? resolveFirstRunRoute(firstRunFacts(state)) : null,
  );
  // The root layout keeps the splash screen up until the store has booted.
  if (!route) return null;
  return <Redirect href={route} />;
}
