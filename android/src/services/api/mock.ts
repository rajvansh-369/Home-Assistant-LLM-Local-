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
//   Unlock, wrong PIN                         422; the 5th wrong try gets 429 with retry_after 30 (as Laravel)
//   Creating the Owner                        also creates a Guest profile (as Laravel)
//   Anything else                             works
//
// Tokens the mock hands out are random strings; a token the mock doesn't know gives 401.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { guestColor, profileColors } from '@/theme/colors';

import {
  ApiError,
  type AsterApi,
  type Conversation,
  type CreateProfileBody,
  DEFAULT_ENGINES,
  type Message,
  type Place,
  type Profile,
  type UpdateProfileBody,
} from './types';

const STORAGE_KEY = 'aster.mock-server';
const SEEDED_PIN = '123456';
const MAX_UNLOCK_TRIES = 5;
const UNLOCK_LOCK_MS = 30_000;
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

type MockProfile = Profile & { pinHash: string; auto_lock_minutes: number | null };
type MockConversation = Conversation & { deleted: boolean };
type MockMessage = Message & { conversation_id: number };

type MockState = {
  household: { email: string; passwordHash: string } | null;
  deviceTokens: string[];
  profileTokens: string[];
  /** Profile token to profile id. */
  tokenProfiles: Record<string, number>;
  profiles: MockProfile[];
  place: Place | null;
  unlock: { failures: number; lockedUntil: number };
  conversations: MockConversation[];
  messages: MockMessage[];
  nextId: number;
};

const emptyState = (): MockState => ({
  household: null,
  deviceTokens: [],
  profileTokens: [],
  tokenProfiles: {},
  profiles: [],
  place: null,
  unlock: { failures: 0, lockedUntil: 0 },
  conversations: [],
  messages: [],
  nextId: 1,
});

const guestProfile = (state: MockState): MockProfile => ({
  id: state.nextId++,
  name: 'Guest',
  color: guestColor,
  role: 'guest',
  pinHash: '',
  auto_lock_minutes: null,
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

/** Returns the token's profile id. */
function requireProfile(state: MockState, token: string): number {
  if (!state.profileTokens.includes(token)) throw unauthenticated();
  return state.tokenProfiles[token] ?? 0;
}

const publicProfile = ({ id, name, color, role }: MockProfile): Profile => ({
  id,
  name,
  color,
  role,
});

/** The full profile, as unlock and PATCH return it. */
const fullProfile = (profile: MockProfile): Profile => ({
  ...publicProfile(profile),
  llm_engine: profile.llm_engine ?? 'local',
  personality: profile.personality ?? null,
  auto_lock_minutes: profile.auto_lock_minutes,
  web_mode: profile.role === 'owner' || profile.role === 'member' ? 'auto' : 'never',
});

function openSession(state: MockState, profile: MockProfile) {
  const profileToken = newToken();
  state.profileTokens.push(profileToken);
  state.tokenProfiles[profileToken] = profile.id;
  return {
    profile_token: profileToken,
    llm_token: newToken(),
    expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
    engines: DEFAULT_ENGINES,
    profile: fullProfile(profile),
  };
}

/** Laravel's time format: UTC, whole seconds, a Z. */
const nowIso = () => `${new Date().toISOString().slice(0, 19)}Z`;

function ownConversation(state: MockState, profileId: number, id: number): MockConversation {
  const conversation = state.conversations.find((c) => c.id === id && c.profile_id === profileId);
  if (!conversation || conversation.deleted) throw new ApiError(404, 'Not found.');
  return conversation;
}

function conversationOut(
  state: MockState,
  { deleted: _deleted, ...conversation }: MockConversation,
) {
  const count = state.messages.filter((m) => m.conversation_id === conversation.id).length;
  return { ...conversation, message_count: count };
}

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
        state.profiles.push(guestProfile(state));
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
    state.profiles.push(profile, guestProfile(state));
    await save(state);
    return fullProfile(profile);
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
    if (body.llm_engine !== undefined) profile.llm_engine = body.llm_engine;
    await save(state);
    return fullProfile(profile);
  },

  async unlockProfile(_server, deviceToken, id, pin) {
    await delay();
    const state = await load();
    requireDevice(state, deviceToken);
    const now = Date.now();
    const locked = () =>
      new ApiError(429, 'Too many wrong PINs.', {
        retryAfter: Math.ceil((state.unlock.lockedUntil - now) / 1000),
      });
    if (state.unlock.lockedUntil > now) throw locked();
    const profile = state.profiles.find((p) => p.id === id);
    if (!profile) throw new ApiError(404, 'Not found.');
    if (profile.role === 'guest')
      throw invalid('pin', 'Guest opens without a PIN; use a Guest session.');
    if (profile.pinHash !== scramble(pin)) {
      state.unlock.failures += 1;
      // Like Laravel's PinGuard: the 5th wrong try itself starts the lockout.
      if (state.unlock.failures >= MAX_UNLOCK_TRIES) {
        state.unlock = { failures: 0, lockedUntil: now + UNLOCK_LOCK_MS };
        await save(state);
        throw locked();
      }
      await save(state);
      throw invalid('pin', 'Wrong PIN.');
    }
    state.unlock = { failures: 0, lockedUntil: 0 };
    const session = openSession(state, profile);
    await save(state);
    return session;
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

  async guestSession(_server, deviceToken) {
    await delay();
    const state = await load();
    requireDevice(state, deviceToken);
    const guest = state.profiles.find((p) => p.role === 'guest');
    if (!guest) throw new ApiError(404, 'This household has no Guest profile yet.');
    const session = openSession(state, guest);
    await save(state);
    return session;
  },

  async lockProfile(_server, profileToken, id) {
    await delay();
    const state = await load();
    if (requireProfile(state, profileToken) !== id) {
      throw new ApiError(403, 'You can only lock your own profile.');
    }
    state.profileTokens = state.profileTokens.filter((t) => t !== profileToken);
    delete state.tokenProfiles[profileToken];
    await save(state);
  },

  async refreshLlmToken(_server, profileToken) {
    await delay();
    requireProfile(await load(), profileToken);
    return { llm_token: newToken(), expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString() };
  },

  async updateMe(_server, profileToken, body) {
    await delay();
    const state = await load();
    const id = requireProfile(state, profileToken);
    const profile = state.profiles.find((p) => p.id === id);
    if (!profile) throw unauthenticated();
    if (body.llm_engine !== undefined) profile.llm_engine = body.llm_engine;
    await save(state);
    return fullProfile(profile);
  },

  async listConversations(_server, profileToken) {
    await delay();
    const state = await load();
    const profileId = requireProfile(state, profileToken);
    const data = state.conversations
      .filter((c) => c.profile_id === profileId && !c.deleted)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((c) => conversationOut(state, c));
    return { data, meta: { next_cursor: null } };
  },

  async createConversation(_server, profileToken, { client_uuid, title }) {
    await delay();
    const state = await load();
    const profileId = requireProfile(state, profileToken);
    let conversation = state.conversations.find((c) => c.client_uuid === client_uuid);
    if (conversation && (conversation.deleted || conversation.profile_id !== profileId)) {
      throw invalid('client_uuid', 'This client_uuid is already in use.');
    }
    if (!conversation) {
      const at = nowIso();
      conversation = {
        id: state.nextId++,
        client_uuid,
        profile_id: profileId,
        title: title.slice(0, 120),
        last_message_at: null,
        message_count: 0,
        created_at: at,
        updated_at: at,
        deleted: false,
      };
      state.conversations.push(conversation);
      await save(state);
    }
    return conversationOut(state, conversation);
  },

  async deleteConversation(_server, profileToken, id) {
    await delay();
    const state = await load();
    const conversation = ownConversation(state, requireProfile(state, profileToken), id);
    conversation.deleted = true;
    conversation.updated_at = nowIso();
    state.messages = state.messages.filter((m) => m.conversation_id !== id);
    await save(state);
  },

  async listMessages(_server, profileToken, conversationId, after = 0) {
    await delay();
    const state = await load();
    ownConversation(state, requireProfile(state, profileToken), conversationId);
    const rest = state.messages.filter((m) => m.conversation_id === conversationId && m.id > after);
    const data = rest.slice(0, 100).map(({ conversation_id: _c, ...message }) => message);
    return { data, meta: { has_more: rest.length > 100 } };
  },

  async postMessages(_server, profileToken, conversationId, messages) {
    await delay();
    const state = await load();
    const conversation = ownConversation(
      state,
      requireProfile(state, profileToken),
      conversationId,
    );
    const stored = messages.map((body) => {
      let message = state.messages.find((m) => m.client_uuid === body.client_uuid);
      if (message && message.conversation_id !== conversationId) {
        throw invalid('messages', 'This client_uuid belongs to another conversation.');
      }
      if (message) {
        Object.assign(message, body);
      } else {
        message = {
          ...body,
          id: state.nextId++,
          created_at: nowIso(),
          conversation_id: conversationId,
        };
        state.messages.push(message);
      }
      if (!conversation.last_message_at || body.sent_at > conversation.last_message_at) {
        conversation.last_message_at = body.sent_at;
      }
      return { id: message.id, client_uuid: message.client_uuid };
    });
    conversation.updated_at = nowIso();
    await save(state);
    return stored;
  },

  async updateMessage(_server, profileToken, id, body) {
    await delay();
    const state = await load();
    const profileId = requireProfile(state, profileToken);
    const message = state.messages.find((m) => m.id === id);
    if (!message) throw new ApiError(404, 'Not found.');
    ownConversation(state, profileId, message.conversation_id);
    Object.assign(message, body);
    await save(state);
    const { conversation_id: _c, ...out } = message;
    return out;
  },
};
