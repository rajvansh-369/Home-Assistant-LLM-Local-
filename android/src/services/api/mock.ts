// Mock Laravel server and zypherLL for development (EXPO_PUBLIC_USE_MOCK_API=1).
// Every call waits 400–800 ms. Server state lives in AsyncStorage, so it survives app restarts;
// "Reset first run" on the Home placeholder clears it.
//
// Trigger inputs:
//   Server address containing "unreachable"   /up times out (Can't reach this server)
//   Password "wrong"                          login: 422 wrong credentials
//   Password "throttle"                       login: 429, retry_after 30
//   Sign in, no household yet                 creates a household with no profiles (goes to 1.3)
//   Sign in, email starting with "owner"      ... and also an Owner "Test Owner" with PIN 123456 (goes to 2.2)
//   Register, email starting with "exists"    403 household exists (also once any household exists)
//   Register, email starting with "taken"     422 on email (already taken)
//   Register, password shorter than 8         422 on password
//   Unlock, wrong PIN                         422; the 5th wrong try locks for 30 s, then 429 with retry_after
//   LLM address containing "loading"          health: model loading
//   LLM address containing "fail"             health: 500, model failed to load
//   LLM address containing "blocked"          health: host blocked by the build
//   LLM address containing "noreply"          health: no reply in 3 s
//   Anything else                             works
//
// Tokens the mock hands out are random strings; a token the mock doesn't know gives 401.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { profileColors } from '@/theme/colors';

import {
  ApiError,
  type AsterApi,
  type CreateProfileBody,
  type LlmHealthCheck,
  type Place,
  type Profile,
  type UpdateProfileBody,
} from './types';

const STORAGE_KEY = 'aster.mock-server';
const SEEDED_PIN = '123456';
const MAX_UNLOCK_TRIES = 5;
const UNLOCK_LOCK_MS = 30_000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const LLM_TIMEOUT_MS = 3000;

type MockProfile = Profile & { pinHash: string; auto_lock_minutes: number | null };

type MockState = {
  household: { email: string; passwordHash: string } | null;
  deviceTokens: string[];
  profileTokens: string[];
  profiles: MockProfile[];
  place: Place | null;
  unlock: { failures: number; lockedUntil: number };
  nextId: number;
};

const emptyState = (): MockState => ({
  household: null,
  deviceTokens: [],
  profileTokens: [],
  profiles: [],
  place: null,
  unlock: { failures: 0, lockedUntil: 0 },
  nextId: 1,
});

let latency: [number, number] = [400, 800];

/** Tests set this to [0, 0]. */
export function setMockLatency(min: number, max: number) {
  latency = [min, max];
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const delay = () => wait(latency[0] + Math.random() * (latency[1] - latency[0]));

// A scrambled copy, like the real server keeps. Not cryptographic; this is a mock.
function scramble(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

const newToken = () =>
  `mock_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

async function load(): Promise<MockState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? { ...emptyState(), ...(JSON.parse(raw) as MockState) } : emptyState();
}

const save = (state: MockState) => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));

/** Clears the mock server. Used by "Reset first run". */
export async function resetMockServer() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

const unauthenticated = () => new ApiError(401, 'Unauthenticated.');
const invalid = (field: string, message: string) =>
  new ApiError(422, message, { fieldErrors: { [field]: [message] } });

function requireDevice(state: MockState, token: string) {
  if (!state.deviceTokens.includes(token)) throw unauthenticated();
}

function requireProfile(state: MockState, token: string) {
  if (!state.profileTokens.includes(token)) throw unauthenticated();
}

const publicProfile = ({ id, name, color, role }: MockProfile): Profile => ({ id, name, color, role });

function validateProfile(body: UpdateProfileBody) {
  if (body.name !== undefined && body.name.trim() === '') {
    throw invalid('name', 'The name field is required.');
  }
}

export const mockApi: AsterApi = {
  async checkServer(server) {
    const started = Date.now();
    await delay();
    if (server.includes('unreachable')) {
      throw new ApiError(0, 'Timed out', { timedOut: true });
    }
    return { ms: Date.now() - started };
  },

  async login(_server, { email, password }) {
    await delay();
    if (password === 'wrong') throw invalid('email', 'These credentials do not match our records.');
    if (password === 'throttle') {
      throw new ApiError(429, 'Too Many Attempts.', { retryAfter: 30 });
    }
    const state = await load();
    if (state.household) {
      if (state.household.email !== email || state.household.passwordHash !== scramble(password)) {
        throw invalid('email', 'These credentials do not match our records.');
      }
    } else {
      state.household = { email, passwordHash: scramble(password) };
      if (email.startsWith('owner')) {
        state.profiles.push({
          id: state.nextId++,
          name: 'Test Owner',
          color: profileColors.lilac,
          role: 'owner',
          pinHash: scramble(SEEDED_PIN),
          auto_lock_minutes: 2,
        });
      }
    }
    const token = newToken();
    state.deviceTokens.push(token);
    await save(state);
    return { token };
  },

  async register(_server, { email, password }) {
    await delay();
    const state = await load();
    if (state.household || email.startsWith('exists')) {
      throw new ApiError(403, 'The household account already exists.');
    }
    if (email.startsWith('taken')) throw invalid('email', 'The email has already been taken.');
    if (password.length < 8) {
      throw invalid('password', 'The password field must be at least 8 characters.');
    }
    state.household = { email, passwordHash: scramble(password) };
    const token = newToken();
    state.deviceTokens.push(token);
    await save(state);
    return { token };
  },

  async listProfiles(_server, deviceToken) {
    await delay();
    const state = await load();
    requireDevice(state, deviceToken);
    return state.profiles.map(publicProfile);
  },

  async createProfile(_server, deviceToken, body: CreateProfileBody) {
    await delay();
    const state = await load();
    requireDevice(state, deviceToken);
    if (state.profiles.length > 0) {
      throw new ApiError(403, 'A device token can only create the first profile.');
    }
    validateProfile(body);
    if (!/^\d{6}$/.test(body.pin)) throw invalid('pin', 'The PIN must be 6 digits.');
    const profile: MockProfile = {
      id: state.nextId++,
      name: body.name.trim(),
      color: body.color,
      role: 'owner',
      pinHash: scramble(body.pin),
      auto_lock_minutes: body.auto_lock_minutes,
    };
    state.profiles.push(profile);
    await save(state);
    return publicProfile(profile);
  },

  async updateProfile(_server, profileToken, id, body) {
    await delay();
    const state = await load();
    requireProfile(state, profileToken);
    const profile = state.profiles.find((p) => p.id === id);
    if (!profile) throw new ApiError(404, 'Not found.');
    validateProfile(body);
    if (body.name !== undefined) profile.name = body.name.trim();
    if (body.color !== undefined) profile.color = body.color;
    if (body.auto_lock_minutes !== undefined) profile.auto_lock_minutes = body.auto_lock_minutes;
    await save(state);
    return publicProfile(profile);
  },

  async unlockProfile(_server, deviceToken, id, pin) {
    await delay();
    const state = await load();
    requireDevice(state, deviceToken);
    const now = Date.now();
    if (state.unlock.lockedUntil > now) {
      throw new ApiError(429, 'Too many tries.', {
        retryAfter: Math.ceil((state.unlock.lockedUntil - now) / 1000),
      });
    }
    const profile = state.profiles.find((p) => p.id === id);
    if (!profile) throw new ApiError(404, 'Not found.');
    if (profile.pinHash !== scramble(pin)) {
      state.unlock.failures += 1;
      if (state.unlock.failures >= MAX_UNLOCK_TRIES) {
        state.unlock = { failures: 0, lockedUntil: now + UNLOCK_LOCK_MS };
      }
      await save(state);
      throw invalid('pin', 'The PIN is wrong.');
    }
    state.unlock = { failures: 0, lockedUntil: 0 };
    const profileToken = newToken();
    state.profileTokens.push(profileToken);
    await save(state);
    return {
      profile_token: profileToken,
      llm_token: newToken(),
      expires_at: new Date(now + TOKEN_TTL_MS).toISOString(),
    };
  },

  async getHomePlace(_server, profileToken) {
    await delay();
    const state = await load();
    requireProfile(state, profileToken);
    return state.place;
  },

  async putHomePlace(_server, profileToken, place) {
    await delay();
    const state = await load();
    requireProfile(state, profileToken);
    if (!/^https?:\/\/[^/\s]+/.test(place.llm_url)) {
      throw invalid('llm_url', 'The llm url field must be a valid URL.');
    }
    state.place = place;
    await save(state);
    return place;
  },
};

export const mockLlmHealth: LlmHealthCheck = async (llmUrl) => {
  const started = Date.now();
  if (llmUrl.includes('noreply')) {
    await wait(latency[1] === 0 ? 0 : LLM_TIMEOUT_MS);
    return { kind: 'no-reply' };
  }
  await delay();
  if (llmUrl.includes('blocked')) return { kind: 'blocked' };
  if (llmUrl.includes('fail')) return { kind: 'failed', error: 'out of memory' };
  if (llmUrl.includes('loading')) return { kind: 'loading', ms: Date.now() - started };
  return { kind: 'ready', model: 'zypher-mock', ms: Date.now() - started };
};
