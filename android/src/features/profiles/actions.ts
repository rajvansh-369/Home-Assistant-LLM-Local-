// 2.1 Who's using, 2.2 Unlock for any profile, 2.5 Guest and locking
// (docs/aster-home-chat-plan.md §2, §4.1–§4.3). Never log tokens or PINs.
import {
  openSession,
  requireServer,
  SignedOutError,
  unlockOwner,
  withDeviceToken,
} from '@/features/first-run/actions';
import { isUnlocked, useFirstRunStore, type Session } from '@/features/first-run/store';
import { api } from '@/services/api';

import { sortProfiles, useProfilesStore, type ProfileSummary } from './store';

const store = () => useFirstRunStore.getState();

/** Guest has no `auto_lock_minutes`; its chat ends after this long in the background. (proposed) */
export const GUEST_AUTO_END_MINUTES = 2;

export type ProfilesResult = { profiles: ProfileSummary[]; fresh: boolean };

/**
 * `GET /profiles` into the cache. On a network failure the cached list comes back with
 * `fresh: false`; a 401 signs the phone out (SignedOutError, the screen goes to 1.2).
 */
export async function loadProfiles(): Promise<ProfilesResult> {
  const server = requireServer();
  try {
    const listed = await withDeviceToken((token) => api.listProfiles(server, token));
    const profiles = sortProfiles(
      listed.map(({ id, name, color, role }) => ({ id, name, color, role })),
    );
    useProfilesStore.getState().set({ profiles });
    return { profiles, fresh: true };
  } catch (error) {
    if (error instanceof SignedOutError) throw error;
    return { profiles: sortProfiles(useProfilesStore.getState().profiles), fresh: false };
  }
}

/** 2.2: unlock any profile with its PIN. Throws ApiError 422 / 429, or SignedOutError. */
export async function unlockProfile(id: number, pin: string): Promise<void> {
  if (store().owner?.id === id) {
    await unlockOwner(pin);
    return;
  }
  const server = requireServer();
  const result = await withDeviceToken((token) => api.unlockProfile(server, token, id, pin));
  await openSession(result);
}

/** 2.5: open the Guest profile (`POST /guest-sessions`). */
export async function openGuestSession(): Promise<void> {
  const server = requireServer();
  const result = await withDeviceToken((token) => api.guestSession(server, token));
  await openSession(result);
}

/**
 * Lock: forget the tokens at once, then tell Laravel (`POST /profiles/{id}/lock`) without
 * waiting; if that fails the token still expires within 12 hours.
 */
export function lockSession() {
  const { session, serverUrl } = store();
  store().set({ session: null });
  if (session && serverUrl) {
    api.lockProfile(serverUrl, session.profileToken, session.profile.id).catch(() => {});
  }
}

/**
 * Whether coming back to the app should lock: the token has expired, or the app was in the
 * background at least the profile's `auto_lock_minutes` ("Lock when I leave"). Guest always ends
 * after GUEST_AUTO_END_MINUTES.
 */
export function shouldLock(
  session: Session | null,
  backgroundedAt: number | null,
  now = Date.now(),
) {
  if (!session) return false;
  if (!isUnlocked(session, now)) return true;
  if (backgroundedAt == null) return false;
  const minutes =
    session.profile.role === 'guest' ? GUEST_AUTO_END_MINUTES : session.profile.auto_lock_minutes;
  return minutes != null && now - backgroundedAt >= minutes * 60_000;
}
