// Wires location to the rest of the app (docs/aster-reminders-location-plan.md §5): the Owner's
// unlock refreshes the settings, the foreground and the end of the first run start or stop the
// updates, a settings change follows at once, and signing out stops everything. Called once from
// the root layout.
import { AppState } from 'react-native';

import { onSessionOpened } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';

import { forgetArea, refreshArea } from './area';
import { clearLocationSettings, refreshLocationSettings, useLocationStore } from './settings';
import { stopTracking, syncTracking } from './tracking';
import { flushDeviceUploads } from './uploads';

let installed = false;

export function installLocation() {
  if (installed) return;
  installed = true;

  void syncTracking();
  void refreshArea();

  onSessionOpened(async () => {
    if (useFirstRunStore.getState().session?.profile.role !== 'owner') return;
    if (await refreshLocationSettings()) void syncTracking();
  });

  AppState.addEventListener('change', (state) => {
    if (state !== 'active') return;
    void syncTracking();
    void flushDeviceUploads();
    void refreshArea();
  });

  useFirstRunStore.subscribe((state, previous) => {
    if (!previous.firstRunDone && state.firstRunDone) void syncTracking();
    if (previous.hasDeviceToken && !state.hasDeviceToken) {
      void stopTracking().then(clearLocationSettings).then(forgetArea);
    }
  });

  useLocationStore.subscribe((state, previous) => {
    const before = previous.settings;
    const after = state.settings;
    if (before.enabled !== after.enabled || before.interval_minutes !== after.interval_minutes) {
      void syncTracking();
    }
    if (!before.share_area && after.share_area) void refreshArea();
  });
}
