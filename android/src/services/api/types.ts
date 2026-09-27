// Request and response shapes for the calls in plan §6, checked against the Laravel controllers,
// form requests and API resources in ../backend (Phase 7). Only the fields the app reads are typed;
// Laravel sends more (listed in the comments).

/** The Owner and Guest are created by the server; member and restricted by the Owner later. */
export type ProfileRole = 'owner' | 'member' | 'restricted' | 'guest';

/** Who answers chats on the home PC; sent to zypherLL as `engine`. */
export type LlmEngine = 'local' | 'markl';

/** An engine and the name the admin panel gave it, e.g. `{ id: 'markl', name: 'Mark-L' }`. */
export type EngineOption = { id: LlmEngine; name: string };

/** What Laravel sends before the admin panel renames anything; shown until the first unlock. */
export const DEFAULT_ENGINES: EngineOption[] = [
  { id: 'local', name: 'Local' },
  { id: 'markl', name: 'Mark-L' },
];

/**
 * `GET /profiles` sends only these four (ProfileSummaryResource). The full profile (unlock, PATCH,
 * /me: ProfileResource) adds has_pin, personality, web_mode, memory_enabled, sampling, max_tokens,
 * auto_lock_minutes and timestamps.
 */
export type Profile = {
  id: number;
  name: string;
  /** Hex colour. Laravel stores and returns it upper-cased (#7FD9B8). */
  color: string;
  role: ProfileRole;
  /** In the full profile (unlock, PATCH, /me); the profile picker list leaves it out. */
  llm_engine?: LlmEngine;
  /** Full profile only. Sent to zypherLL as a system message when set. */
  personality?: string | null;
  /** Full profile only. 2 when "Lock when I leave" is on, null when off. */
  auto_lock_minutes?: number | null;
  /** Full profile only. `never` turns web lookups off (the llm_token says so too). */
  web_mode?: 'auto' | 'never';
};

/** PlaceResource; Laravel also returns id and updated_at. */
export type Place = {
  name: 'Home';
  address: string;
  lat: number;
  lng: number;
  radius_m: number;
  wifi_ssid: string | null;
  llm_url: string;
};

/** `device_name` is at most 100 characters; `app_version` at most 40 and optional. */
export type LoginBody = {
  email: string;
  password: string;
  device_name: string;
  app_version?: string;
};
export type RegisterBody = LoginBody & { name: string };
/** Laravel also returns household_id, user { id, name, email } and device { id, name }. */
export type TokenResponse = { token: string };

export type CreateProfileBody = {
  name: string;
  color: string;
  role: 'owner';
  pin: string;
  /** 2 when "Lock when I leave" is on, null when off. */
  auto_lock_minutes: number | null;
};

export type UpdateProfileBody = Partial<
  Pick<CreateProfileBody, 'name' | 'color' | 'auto_lock_minutes'>
> & {
  llm_engine?: LlmEngine;
};

/** Laravel also returns household_id. `/guest-sessions` returns the same shape. */
export type UnlockResponse = {
  profile_token: string;
  llm_token: string;
  /** ISO 8601, 12 hours after unlock. */
  expires_at: string;
  /** Local first, then Mark-L, with the names set in the admin panel. */
  engines: EngineOption[];
  /** The full profile, including its `llm_engine`. */
  profile: Profile;
};

/** `POST /llm-token`: a fresh llm_token for the unlocked profile. */
export type LlmTokenResponse = { llm_token: string; expires_at: string };

/** Fields a profile may change on itself with `PATCH /me`. */
export type UpdateMeBody = { llm_engine?: LlmEngine };

export type Conversation = {
  id: number;
  client_uuid: string;
  profile_id: number;
  title: string;
  last_message_at: string | null;
  message_count: number;
  created_at: string;
  updated_at: string;
};

/** A web source zypherLL cited: `n` is the [n] marker in the answer. */
export type Source = { n?: number | null; title?: string | null; url: string };

export type FinishReason = 'stop' | 'length' | 'cancelled' | 'error';

/** What the phone uploads for one message; Laravel's Message adds id and created_at. */
export type MessageBody = {
  client_uuid: string;
  role: 'user' | 'assistant';
  content: string;
  sent_at: string;
  finish_reason?: FinishReason | null;
  memory_id?: number | null;
  live?: boolean;
  cited?: boolean;
  sources?: Source[];
  recalled?: number | null;
  sampling?: 'precise' | 'balanced' | 'creative' | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  seconds?: number | null;
  rating?: 'good' | 'bad' | null;
  /** Flags for what the app added to the prompt, never message text. */
  context?: string[];
};

export type Message = MessageBody & { id: number; created_at: string };

export type ConversationPage = {
  data: Conversation[];
  meta: { next_cursor: string | null };
};

export type MessagePage = { data: Message[]; meta: { has_more: boolean } };

export type UpdateMessageBody = {
  rating?: 'good' | 'bad' | null;
  content?: string;
  finish_reason?: FinishReason | null;
};

/** Every failed call becomes an ApiError. `status` 0 means no HTTP reply (network or timeout). */
export class ApiError extends Error {
  readonly status: number;
  /** Laravel 422 `errors`: field name to messages. */
  readonly fieldErrors: Record<string, string[]>;
  /** Seconds, from a 429's `retry_after` body field or `Retry-After` header. */
  readonly retryAfter: number | null;
  readonly timedOut: boolean;

  constructor(
    status: number,
    message: string,
    options: {
      fieldErrors?: Record<string, string[]>;
      retryAfter?: number | null;
      timedOut?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fieldErrors = options.fieldErrors ?? {};
    this.retryAfter = options.retryAfter ?? null;
    this.timedOut = options.timedOut ?? false;
  }

  /** First message for a field, falling back to the top-level message (plan §6 Errors). */
  messageFor(field: string): string {
    return this.fieldErrors[field]?.[0] ?? this.message;
  }
}

/**
 * The Laravel API. `server` is the base URL entered at 1.2 (without `/api`); implementations add
 * `/api`, `Accept: application/json` and the timeouts from §6.
 */
export interface AsterApi {
  /** `GET {server}/up`, 5 s timeout. Resolves with the round trip in ms. */
  checkServer(server: string): Promise<{ ms: number }>;
  login(server: string, body: LoginBody): Promise<TokenResponse>;
  register(server: string, body: RegisterBody): Promise<TokenResponse>;
  listProfiles(server: string, deviceToken: string): Promise<Profile[]>;
  /** Device token; only allowed for the first profile. */
  createProfile(server: string, deviceToken: string, body: CreateProfileBody): Promise<Profile>;
  updateProfile(
    server: string,
    profileToken: string,
    id: number,
    body: UpdateProfileBody,
  ): Promise<Profile>;
  unlockProfile(
    server: string,
    deviceToken: string,
    id: number,
    pin: string,
  ): Promise<UnlockResponse>;
  /** Resolves with null on 404 (no home yet). */
  getHomePlace(server: string, profileToken: string): Promise<Place | null>;
  putHomePlace(server: string, profileToken: string, place: Place): Promise<Place>;

  /** 2.5: opens the Guest profile, same shape as unlock. */
  guestSession(server: string, deviceToken: string): Promise<UnlockResponse>;
  /** Ends this phone's session for the profile (204). */
  lockProfile(server: string, profileToken: string, id: number): Promise<void>;
  refreshLlmToken(server: string, profileToken: string): Promise<LlmTokenResponse>;
  updateMe(server: string, profileToken: string, body: UpdateMeBody): Promise<Profile>;

  /** Newest first, 50 a page; pass the previous page's `next_cursor` for the next. */
  listConversations(
    server: string,
    profileToken: string,
    cursor?: string | null,
  ): Promise<ConversationPage>;
  /** 201 when new, 200 when the client_uuid exists: safe to retry. */
  createConversation(
    server: string,
    profileToken: string,
    body: { client_uuid: string; title: string },
  ): Promise<Conversation>;
  deleteConversation(server: string, profileToken: string, id: number): Promise<void>;
  /** Oldest first, after message id `after`, up to 100. */
  listMessages(
    server: string,
    profileToken: string,
    conversationId: number,
    after?: number,
  ): Promise<MessagePage>;
  /** 1–50 messages; safe to retry (client_uuid). Returns the ids Laravel gave them. */
  postMessages(
    server: string,
    profileToken: string,
    conversationId: number,
    messages: MessageBody[],
  ): Promise<{ id: number; client_uuid: string }[]>;
  updateMessage(
    server: string,
    profileToken: string,
    id: number,
    body: UpdateMessageBody,
  ): Promise<Message>;
}

/**
 * What a zypherLL with two engines adds to `/health`: each engine's state ("ready", "loading",
 * "error", "unconfigured", …), the default engine, and whether it is answering someone now.
 */
export type HealthServer = {
  engines: Record<string, string>;
  engine: string | null;
  busy: boolean;
};

export type LlmHealth =
  /** `model` is the default engine's model id ("zephyr-7b"); older servers leave it out. */
  | { kind: 'ready'; model: string | null; ms: number; server?: HealthServer }
  | { kind: 'loading'; ms: number; server?: HealthServer }
  | { kind: 'failed'; error: string; ms?: number; server?: HealthServer }
  | { kind: 'no-reply' }
  /** Release build, plain http to a host other than HOME_LLM_HOST (plan §7). */
  | { kind: 'blocked' }
  /** A reply that isn't zypherLL's /health, e.g. 404 from the wrong port. */
  | { kind: 'unexpected'; status: number };
