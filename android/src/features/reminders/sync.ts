// Reminders from Laravel (docs/aster-reminders-location-plan.md §4 Laravel), for the unlocked
// profile. A reminder with jobs still queued keeps the phone's copy; otherwise Laravel's wins. An
// uploaded reminder missing from the list was deleted elsewhere and goes; so does one Laravel says
// is done or cancelled. Reminders not uploaded yet stay.
import { isAtHome } from '@/features/home-mode/mode';
import { useHomeModeStore } from '@/features/home-mode/store';
import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import { api } from '@/services/api';
import type { Reminder } from '@/services/api/types';

import { canUseReminders } from './actions';
import { reconcileAlarms } from './alarms';
import { hasJobs } from './queue';
import { changeReminders, type LocalReminder, type SavedReminders } from './store';

/** The merge, pure. `atHome`: new arrive-home reminders wait for a departure. */
export function mergeReminders(
  saved: SavedReminders,
  profile: { id: number; name: string },
  server: Reminder[],
  atHome: boolean,
): Record<string, LocalReminder> {
  const next = { ...saved.reminders };
  const listed = new Set<number>();

  for (const remote of server) {
    listed.add(remote.id);
    const local = next[remote.client_uuid];
    if (local && hasJobs(saved.queue, local.clientUuid)) {
      if (local.serverId == null) next[local.clientUuid] = { ...local, serverId: remote.id };
      continue;
    }
    if (remote.status !== 'pending') {
      delete next[remote.client_uuid];
      continue;
    }
    const moved =
      local != null && (local.dueAt !== remote.due_at || local.trigger !== remote.trigger);
    next[remote.client_uuid] = {
      clientUuid: remote.client_uuid,
      serverId: remote.id,
      profileId: profile.id,
      profileName: profile.name,
      title: remote.title,
      trigger: remote.trigger,
      dueAt: remote.due_at,
      status: remote.status,
      armed: remote.trigger !== 'arrive_home' ? false : local && !moved ? local.armed : !atHome,
      firedAt: local && !moved ? local.firedAt : null,
      snoozedUntil: local && !moved ? local.snoozedUntil : null,
      createdAt: local?.createdAt ?? remote.created_at,
      updatedAt: remote.updated_at,
    };
  }

  for (const local of Object.values(saved.reminders)) {
    if (local.profileId !== profile.id || local.serverId == null) continue;
    if (!listed.has(local.serverId) && !hasJobs(saved.queue, local.clientUuid)) {
      delete next[local.clientUuid];
    }
  }
  return next;
}

let syncing: Promise<void> | null = null;

/** Laravel's list for the unlocked profile, merged in; alarms follow. Failures wait for next time. */
export function syncReminders(): Promise<void> {
  syncing ??= (async () => {
    try {
      const { session, serverUrl } = useFirstRunStore.getState();
      if (!serverUrl || !isUnlocked(session) || !canUseReminders(session!.profile.role)) return;
      const { profile, profileToken } = session!;
      const list = await api.listReminders(serverUrl, profileToken);
      const atHome = isAtHome(useHomeModeStore.getState().mode);
      await changeReminders((saved) => ({
        reminders: mergeReminders(saved, profile, list, atHome),
      }));
      await reconcileAlarms();
    } catch {
      // Offline or refused: the phone's copy stands until the next sync.
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}
