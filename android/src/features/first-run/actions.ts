// First-run server calls in the order plan §5 gives, and the state each one leaves behind.
// Screens call these and navigate with the route they return. Never log tokens, PINs or passwords.
import * as Device from 'expo-device';

import { api, ApiError, type Place, type Profile } from '@/services/api';
import { resetMockServer } from '@/services/api/mock';
import * as secure from '@/services/secure';
import { profileColors, type ProfileColor } from '@/theme';

import { signIn as signInCopy } from './copy';
import { resolveFirstRunRoute, type FirstRunRoute } from './routing';
import { firstRunFacts, isUnlocked, useFirstRunStore } from './store';

const AUTO_LOCK_MINUTES = 2;

const store = () => useFirstRunStore.getState();
const nextRoute = (): FirstRunRoute => resolveFirstRunRoute(firstRunFacts(store()));
const deviceName = () => Device.modelName ?? 'Android phone';

function colorKey(hex: string): ProfileColor {
  const match = (Object.keys(profileColors) as ProfileColor[]).find(
    (key) => profileColors[key].toLowerCase() === hex.toLowerCase(),
  );
  return match ?? 'mint';
}

function requireServer(): string {
  const { serverUrl } = store();
  if (!serverUrl) throw new Error('No server address');
  return serverUrl;
}

async function requireDeviceToken(): Promise<string> {
  const token = await secure.getDeviceToken();
  if (!token) throw new ApiError(401, 'Unauthenticated.');
  return token;
}

/** Plan §5: a 401 on a device-token call signs the phone out and returns to 1.2. */
async function withDeviceToken<T>(call: (token: string) => Promise<T>): Promise<T> {
  try {
    return await call(await requireDeviceToken());
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      await secure.deleteDeviceToken();
      store().set({ hasDeviceToken: false, session: null, signInNotice: signInCopy.signInAgain });
      throw new SignedOutError();
    }
    throw error;
  }
}

/**
 * 1.3 register step failed with a 422 on email or password, or the household already exists.
 * The store's `signInReturn` says how 1.2 should look; the screen should go back to /sign-in.
 */
export class RegisterRejectedError extends Error {
  constructor() {
    super('Register rejected');
    this.name = 'RegisterRejectedError';
  }
}

/** Thrown after a 401 has signed the phone out; the screen should replace with /sign-in. */
export class SignedOutError extends Error {
  constructor() {
    super('Signed out');
    this.name = 'SignedOutError';
  }
}

async function loadBoot() {
  await useFirstRunStore.persist.rehydrate();
  const token = await secure.getDeviceToken();
  store().set({ hasDeviceToken: token != null, booted: true });
}

let booting: Promise<void> | null = null;

/** Loads the persisted slice and checks for a device token. Safe to call more than once. */
export function bootFirstRun(): Promise<void> {
  booting ??= loadBoot().catch((error) => {
    booting = null;
    throw error;
  });
  return booting;
}

/** Where launch routing sends the user right now. */
export const currentFirstRunRoute = nextRoute;

type Credentials = { server: string; email: string; password: string };

/** 1.2 Sign in: login, store the device token, then find the Owner. */
export async function signIn({ server, email, password }: Credentials): Promise<FirstRunRoute> {
  const state = store();
  // Going back never repeats a server write: sign in again only if server or email changed.
  const alreadySignedIn = state.hasDeviceToken && state.serverUrl === server && state.email === email;
  if (!alreadySignedIn) {
    const { token } = await api.login(server, { email, password, device_name: deviceName() });
    await secure.setDeviceToken(token);
    store().set({
      serverUrl: server,
      email,
      hasDeviceToken: true,
      pendingRegistration: null,
      signInNotice: null,
      // A different account: forget the old one's facts.
      ...(state.serverUrl === server && state.email === email
        ? {}
        : { owner: null, home: null, session: null, homePrefill: null }),
    });
  }
  const profiles = await withDeviceToken((token) => api.listProfiles(server, token));
  const owner = profiles.find((p) => p.role === 'owner');
  store().set({ owner: owner ? toOwner(owner) : null });
  return nextRoute();
}

/** 1.2 register mode Continue: validation happens on the screen; nothing is sent yet. */
export function startRegistration({ server, email, password }: Credentials): FirstRunRoute {
  store().set({ serverUrl: server, email, pendingRegistration: { email, password } });
  return '/create-owner';
}

/** 1.3 may only open with a device token or register-mode credentials in memory (plan §5). */
export function canOpenCreateOwner(): boolean {
  const state = store();
  return state.hasDeviceToken || state.pendingRegistration != null;
}

const toOwner = (profile: Profile) => ({
  id: profile.id,
  name: profile.name,
  color: colorKey(profile.color),
});

export type OwnerInput = {
  name: string;
  color: ProfileColor;
  pin: string;
  fingerprint: boolean;
  lockWhenLeave: boolean;
};

/**
 * 1.3 Create profile: register (register mode only), create the Owner, unlock, then save the
 * biometric PIN. Each step is skipped if an earlier attempt already did it. Returns the next route.
 */
export async function createOwner(input: OwnerInput): Promise<FirstRunRoute> {
  const server = requireServer();
  const autoLock = input.lockWhenLeave ? AUTO_LOCK_MINUTES : null;
  const color = profileColors[input.color];
  let state = store();

  if (!state.hasDeviceToken) {
    const pending = state.pendingRegistration;
    if (!pending) return '/sign-in';
    let token: string;
    try {
      ({ token } = await api.register(server, {
        name: input.name.trim(),
        email: pending.email,
        password: pending.password,
        device_name: deviceName(),
      }));
    } catch (error) {
      throw registerFailure(error);
    }
    await secure.setDeviceToken(token);
    store().set({ hasDeviceToken: true, pendingRegistration: null });
  }

  state = store();
  if (state.owner) {
    // The Owner exists: edit it (needs the profile token), or unlock first.
    if (!isUnlocked(state.session)) return '/unlock-owner';
    return saveOwner(input);
  }

  const profile = await withDeviceToken((token) =>
    api.createProfile(server, token, {
      name: input.name.trim(),
      color,
      role: 'owner',
      pin: input.pin,
      auto_lock_minutes: autoLock,
    }),
  );
  store().set({ owner: toOwner(profile), lockWhenLeave: input.lockWhenLeave });

  await unlockOwner(input.pin);

  let fingerprint = input.fingerprint;
  if (fingerprint) {
    try {
      await secure.saveBiometricPin(input.pin);
    } catch {
      // Prompt cancelled: turn the switch off and carry on (plan §4.3).
      fingerprint = false;
    }
  }
  store().set({ fingerprintEnabled: fingerprint });
  return nextRoute();
}

/** Plan Phase 4: which register failures send the user back to 1.2, and how. */
function registerFailure(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;
  if (error.status === 403 || error.status === 409) {
    store().set({
      pendingRegistration: null,
      signInNotice: signInCopy.householdExists,
      signInReturn: { mode: 'signIn' },
    });
    return new RegisterRejectedError();
  }
  if (error.status === 422) {
    const field = (['email', 'password'] as const).find((f) => error.fieldErrors[f]?.length);
    // A name error stays on 1.3; email or password errors are fixed on 1.2.
    if (!field) return error;
    store().set({ signInReturn: { mode: 'register', field, message: error.messageFor(field) } });
    return new RegisterRejectedError();
  }
  return error;
}

/** 1.3 after the Owner exists: PATCH name, colour and lock (the PIN can't change here). */
export async function saveOwner(input: Omit<OwnerInput, 'pin'>): Promise<FirstRunRoute> {
  const server = requireServer();
  const { owner, session } = store();
  if (!owner) return '/create-owner';
  if (!session || !isUnlocked(session)) return '/unlock-owner';
  const profile = await api.updateProfile(server, session.profileToken, owner.id, {
    name: input.name.trim(),
    color: profileColors[input.color],
    auto_lock_minutes: input.lockWhenLeave ? AUTO_LOCK_MINUTES : null,
  });
  store().set({ owner: toOwner(profile), lockWhenLeave: input.lockWhenLeave });
  if (!input.fingerprint && store().fingerprintEnabled) {
    await secure.deleteBiometricPin();
    store().set({ fingerprintEnabled: false });
  }
  return nextRoute();
}

/** 1.3 and 2.2: unlock the Owner and keep the tokens in memory. Throws ApiError 422 / 429. */
export async function unlockOwner(pin: string): Promise<FirstRunRoute> {
  const server = requireServer();
  const { owner } = store();
  if (!owner) return '/create-owner';
  const result = await withDeviceToken((token) => api.unlockProfile(server, token, owner.id, pin));
  const session = {
    profileToken: result.profile_token,
    llmToken: result.llm_token,
    expiresAt: result.expires_at,
  };
  store().set({ session });
  if (!store().home) {
    const place = await api.getHomePlace(server, session.profileToken).catch(() => null);
    store().set({ homePrefill: place });
  }
  return nextRoute();
}

/** 1.4 Save home: PUT /places/home (safe to repeat) and keep a local copy. */
export async function saveHome(place: Omit<Place, 'name'>): Promise<FirstRunRoute> {
  const server = requireServer();
  const { session } = store();
  if (!session || !isUnlocked(session)) return '/unlock-owner';
  const saved = await api.putHomePlace(server, session.profileToken, { name: 'Home', ...place });
  const { name: _name, ...home } = saved;
  store().set({ home, homePrefill: null });
  return nextRoute();
}

/** 1.5 Finish setup and Skip for now. The caller replaces the stack with /home. */
export function finishFirstRun() {
  store().set({ permissionsDone: true, firstRunDone: true });
}

/** Dev only: back to a fresh install, including the secure store and the mock server. */
export async function resetFirstRun() {
  await Promise.all([
    secure.clearSecureStore(),
    resetMockServer(),
    useFirstRunStore.persist.clearStorage(),
  ]);
  store().resetAll();
}
