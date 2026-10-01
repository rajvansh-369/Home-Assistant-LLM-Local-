// 2.3 Profiles and 2.4 Edit profile (docs/aster-profiles-memory-plan.md §4): the Owner's view of
// the household. The list comes from `GET /profiles` (the 2.1 cache), and each other profile's
// settings from `GET /profiles/{id}` (B1). Memory only, and nothing secret: names and settings.
import { create } from 'zustand';

import { isUnlocked, useFirstRunStore } from '@/features/first-run/store';
import {
  api,
  ApiError,
  type CreateProfileBody,
  type Profile,
  type UpdateProfileBody,
} from '@/services/api';

import { loadProfiles } from './actions';
import { useProfilesStore } from './store';

type ManageStore = {
  /** Full profiles by id, as `GET /profiles/{id}` last sent them. */
  details: Record<number, Profile>;
  /** False when Laravel has no `GET /profiles/{id}` yet (404 / 405): summaries only. */
  detailsSupported: boolean;
  set: (patch: Partial<Omit<ManageStore, 'set'>>) => void;
};

export const useManageStore = create<ManageStore>()((set) => ({
  details: {},
  detailsSupported: true,
  set: (patch) => set(patch),
}));

const store = () => useManageStore.getState();

export function ownerSession() {
  const { session, serverUrl } = useFirstRunStore.getState();
  if (!serverUrl || !isUnlocked(session) || session!.profile.role !== 'owner') return null;
  return { server: serverUrl, token: session!.profileToken };
}

/** 404 / 405 from a route today's Laravel may not have. */
export const missingRoute = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 405);

/**
 * 2.3 opening: the list, then every profile but the Owner's in full. Resolves false when the list
 * came from the cache (offline). A profile Laravel can't send keeps its last details.
 */
export async function refreshHousehold(): Promise<boolean> {
  const { profiles, fresh } = await loadProfiles();
  const owner = ownerSession();
  if (!owner || !store().detailsSupported) return fresh;
  const others = profiles.filter((p) => p.role !== 'owner');
  const results = await Promise.allSettled(
    others.map((p) => api.getProfile(owner.server, owner.token, p.id)),
  );
  const details = { ...store().details };
  let supported = true;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') details[others[i].id] = result.value;
    // 405: Laravel without the route (before 1 Oct 2026). A 404 is one profile gone meanwhile.
    else if (result.reason instanceof ApiError && result.reason.status === 405) supported = false;
  });
  store().set({ details, detailsSupported: supported });
  return fresh;
}

/** Puts a changed profile into the 2.3 details and the 2.1 cache. */
export function rememberProfile(profile: Profile) {
  store().set({ details: { ...store().details, [profile.id]: profile } });
  const cache = useProfilesStore.getState();
  cache.set({
    profiles: cache.profiles.map((p) =>
      p.id === profile.id
        ? {
            id: profile.id,
            name: profile.name,
            color: profile.color,
            role: profile.role,
            ...(profile.chat_enabled === false ? { chat_enabled: false } : {}),
          }
        : p,
    ),
  });
}

/**
 * 2.3 "Allow guest sessions": Guest's `chat_enabled` (B2). Shown at once, put back if Laravel
 * refuses. Resolves false when not saved.
 */
export async function setGuestAllowed(allowed: boolean): Promise<boolean> {
  const owner = ownerSession();
  const guest = useProfilesStore.getState().profiles.find((p) => p.role === 'guest');
  if (!owner || !guest) return false;
  const before = store().details[guest.id] ?? {
    ...guest,
    chat_enabled: guest.chat_enabled ?? true,
  };
  rememberProfile({ ...before, chat_enabled: allowed });
  try {
    rememberProfile(
      await api.updateProfile(owner.server, owner.token, guest.id, { chat_enabled: allowed }),
    );
    return true;
  } catch {
    rememberProfile(before);
    return false;
  }
}

/** 2.4 opening: one profile in full. Throws ApiError (405 on Laravel without the route). */
export async function loadProfileDetails(id: number): Promise<Profile> {
  const owner = ownerSession();
  if (!owner) throw new Error('The Owner is not unlocked.');
  const profile = await api.getProfile(owner.server, owner.token, id);
  rememberProfile(profile);
  return profile;
}

/**
 * 2.4: one change, shown at once and put back if Laravel refuses. Throws the ApiError, so a 422
 * can show on its field.
 */
export async function saveProfileChange(id: number, patch: UpdateProfileBody): Promise<Profile> {
  const owner = ownerSession();
  const before = store().details[id];
  if (!owner || !before) throw new Error('The Owner is not unlocked.');
  const { pin: _pin, ...shown } = patch;
  rememberProfile({ ...before, ...shown });
  try {
    const saved = await api.updateProfile(owner.server, owner.token, id, patch);
    rememberProfile(saved);
    return saved;
  } catch (error) {
    rememberProfile(before);
    throw error;
  }
}

/** 2.4 "Create profile" (Owner's token). Throws ApiError; 422 names the field. */
export async function createHouseholdProfile(body: CreateProfileBody): Promise<Profile> {
  const owner = ownerSession();
  if (!owner) throw new Error('The Owner is not unlocked.');
  const profile = await api.createProfile(owner.server, owner.token, body);
  store().set({ details: { ...store().details, [profile.id]: profile } });
  await loadProfiles();
  return profile;
}

/** 2.4 "Delete … and their chats". Throws ApiError. */
export async function deleteHouseholdProfile(id: number): Promise<void> {
  const owner = ownerSession();
  if (!owner) throw new Error('The Owner is not unlocked.');
  await api.deleteProfile(owner.server, owner.token, id);
  const { [id]: _gone, ...details } = store().details;
  store().set({ details });
  const cache = useProfilesStore.getState();
  cache.set({ profiles: cache.profiles.filter((p) => p.id !== id) });
}
