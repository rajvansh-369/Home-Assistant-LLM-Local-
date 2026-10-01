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
  web_mode?: WebMode;
  /** Full profile only. Off: zypherLL keeps no memory for this profile (llm_token `memory`). */
  memory_enabled?: boolean;
  /** Full profile only. 2.4 "Answer style". */
  sampling?: Sampling;
  /** Full profile only. False for Guest. */
  has_pin?: boolean;
  /**
   * Proposed for Laravel (profiles plan §2, B3, B4): "Keep chat history" and "Chat with Aster".
   * Missing until the server has them; the 2.4 rows stay hidden while missing.
   */
  history_enabled?: boolean;
  chat_enabled?: boolean;
  /** "Voice and wake word" (Laravel since 1 Oct 2026); always false for Guest. */
  voice_enabled?: boolean;
};

export type WebMode = 'auto' | 'never';

/** 2.4 "Answer style"; sent to zypherLL as `sampling` (auto leaves it out). */
export type Sampling = 'auto' | 'precise' | 'balanced' | 'creative';

/** Fields of a profile that the Owner (`PATCH /profiles/{id}`) or the profile (`/me`) may change. */
export type ProfileFields = {
  name: string;
  color: string;
  web_mode: WebMode;
  memory_enabled: boolean;
  sampling: Sampling;
  /** 2 when "Lock when I leave" is on, null when off. */
  auto_lock_minutes: number | null;
  llm_engine: LlmEngine;
  history_enabled: boolean;
  chat_enabled: boolean;
  voice_enabled: boolean;
};

/** PlaceResource; Laravel also returns updated_at. */
export type Place = {
  /** Laravel's id, sent as a location point's place_id. Missing on copies made before R4. */
  id?: number;
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

/**
 * `POST /profiles`: the Owner with the device token (first run), Member and Restricted with the
 * Owner's profile token (2.4). The PIN is 6 digits.
 */
export type CreateProfileBody = {
  name: string;
  color: string;
  role: 'owner' | 'member' | 'restricted';
  pin: string;
  /** 2 when "Lock when I leave" is on, null when off. */
  auto_lock_minutes: number | null;
} & Partial<Omit<ProfileFields, 'name' | 'color' | 'auto_lock_minutes'>>;

/** `PATCH /profiles/{id}` (Owner). Role only between member and restricted; Guest has no PIN. */
export type UpdateProfileBody = Partial<ProfileFields> & {
  role?: 'member' | 'restricted';
  pin?: string;
};

/** Laravel also returns household_id. `/guest-sessions` returns the same shape. */
export type UnlockResponse = {
  profile_token: string;
  /** Null while the Owner has turned chat off for the profile (`chat_enabled`, profiles plan B4). */
  llm_token: string | null;
  /** ISO 8601, 12 hours after unlock. */
  expires_at: string;
  /** Local first, then Mark-L, with the names set in the admin panel. */
  engines: EngineOption[];
  /** The full profile, including its `llm_engine`. */
  profile: Profile;
};

/** `POST /llm-token`: a fresh llm_token for the unlocked profile. */
export type LlmTokenResponse = { llm_token: string; expires_at: string };

/** Fields a profile may change on itself with `PATCH /me`; a new PIN needs `current_pin`. */
export type UpdateMeBody = Partial<ProfileFields> & { pin?: string; current_pin?: string };

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

// Reminders and location (docs/aster-reminders-location-plan.md, backend plan §5).

export type ReminderTrigger = 'time' | 'arrive_home';
export type ReminderStatus = 'pending' | 'done' | 'cancelled';

/** ReminderResource. `due_at` is set for time reminders, null for arrive-home ones. */
export type Reminder = {
  id: number;
  client_uuid: string;
  title: string;
  due_at: string | null;
  trigger: ReminderTrigger;
  status: ReminderStatus;
  created_at: string;
  updated_at: string;
};

/** `POST /reminders`: 201 when new, 200 when the client_uuid exists. */
export type CreateReminderBody = {
  client_uuid: string;
  /** At most 200 characters. */
  title: string;
  trigger: ReminderTrigger;
  /** Required when trigger is time. */
  due_at: string | null;
  status?: ReminderStatus;
};

export type UpdateReminderBody = Partial<
  Pick<CreateReminderBody, 'title' | 'trigger' | 'due_at' | 'status'>
>;

export type LocationEvent = 'periodic' | 'arrived' | 'left';

/** One point of `POST /locations/batch` (1–500 a call, device token). */
export type LocationPointBody = {
  client_uuid: string;
  lat: number;
  lng: number;
  accuracy_m?: number | null;
  event: LocationEvent;
  place_id?: number | null;
  recorded_at: string;
};

/** `discarded`: points Laravel dropped because tracking was off or paused. */
export type LocationBatchResult = { accepted: number; duplicates: number; discarded: number };

/** PointResource, from `GET /locations?date=&tz=`. */
export type LocationPoint = {
  id: number;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  event: LocationEvent;
  place_id: number | null;
  recorded_at: string;
};

export type LocationDay = {
  data: LocationPoint[];
  meta: { date: string; tz: string; count: number };
};

/** LocationSettingResource (Owner only); Laravel also returns updated_at. */
export type LocationSettings = {
  enabled: boolean;
  /** 15–120. */
  interval_minutes: number;
  /** 1–90. */
  retention_days: number;
  /** "Use my area in answers". */
  share_area: boolean;
  paused_until: string | null;
};

// Messages and spoken alerts (docs/aster-messages-alerts-plan.md, backend plan §5).

/** Where a captured message came from; also a VIP contact's `sources`. */
export type MessageSource = 'whatsapp' | 'google_chat' | 'sms';

/** What Aster says for a missed VIP message. */
export type SpeakMode = 'full' | 'name' | 'summary';

/** AlertSettingResource (Owner only); Laravel also returns updated_at. */
export type AlertSettings = {
  /** "Speak missed messages". */
  enabled: boolean;
  /** 1–120. */
  missed_after_minutes: number;
  speak_mode: SpeakMode;
  /** "HH:MM" in the phone's time, or null when quiet hours are off. */
  quiet_start: string | null;
  quiet_end: string | null;
  /** Up to 20, each up to 40 characters. Empty when "Still speak urgent ones" is off. */
  urgent_keywords: string[];
  headphones_only: boolean;
  only_at_home: boolean;
};

/** VipContactResource (Owner only); Laravel also returns updated_at. */
export type VipContact = {
  id: number;
  /** At most 60. */
  name: string;
  /** The sender name as it appears in notifications, at most 120. */
  match_key: string;
  /** At least one. */
  sources: MessageSource[];
  enabled: boolean;
};

export type VipContactBody = Omit<VipContact, 'id'>;

/** One event of `POST /activity/batch` (1–500 a call, device token). */
export type ActivityEventBody = {
  client_uuid: string;
  profile_id?: number | null;
  /**
   * Lowercase letters and underscores, at most 40: arrived_home, left_home, reminder_fired,
   * spoken_alert, reply_sent, server_problem.
   */
  type: string;
  /** At most 200 characters. */
  summary: string;
  /** At most 2 KB as JSON. */
  meta?: Record<string, unknown> | null;
  occurred_at: string;
};

export type ActivityBatchResult = { accepted: number; duplicates: number };

/** ActivityResource: an event of `GET /activity`. `profile_id` is null for device events. */
export type Activity = {
  id: number;
  profile_id: number | null;
  device_id: number | null;
  type: string;
  summary: string;
  meta: Record<string, unknown>;
  occurred_at: string;
};

/** Newest first; `next_cursor` is null on the last page. */
export type ActivityPage = { data: Activity[]; meta: { next_cursor: string | null } };

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
  /** The device token for the first profile (the Owner); the Owner's profile token after that. */
  createProfile(server: string, token: string, body: CreateProfileBody): Promise<Profile>;
  /** Owner. Proposed for Laravel (B1); 404 or 405 until it has the route. */
  getProfile(server: string, profileToken: string, id: number): Promise<Profile>;
  /** Owner; not the Owner or Guest (422). Soft delete; the profile's sessions end. */
  deleteProfile(server: string, profileToken: string, id: number): Promise<void>;
  /** Owner. */
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
  /** Not Guest. The unlocked profile, in full. */
  getMe(server: string, profileToken: string): Promise<Profile>;
  /** Not Guest. A wrong `current_pin` is a 422 on `current_pin`. */
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
  /** Every conversation of the profile. Proposed for Laravel (B6). */
  deleteAllConversations(server: string, profileToken: string): Promise<void>;
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

  /** The unlocked profile's reminders, every status. 403 for Restricted and Guest. */
  listReminders(server: string, profileToken: string): Promise<Reminder[]>;
  /** Safe to retry (client_uuid). */
  createReminder(server: string, profileToken: string, body: CreateReminderBody): Promise<Reminder>;
  updateReminder(
    server: string,
    profileToken: string,
    id: number,
    body: UpdateReminderBody,
  ): Promise<Reminder>;
  deleteReminder(server: string, profileToken: string, id: number): Promise<void>;

  /** Device token; safe to retry (client_uuid). */
  postLocations(
    server: string,
    deviceToken: string,
    points: LocationPointBody[],
  ): Promise<LocationBatchResult>;
  /** Device token; safe to retry (client_uuid). */
  postActivity(
    server: string,
    deviceToken: string,
    events: ActivityEventBody[],
  ): Promise<ActivityBatchResult>;
  /** Not Guest. The profile's events, newest first, 50 a page; the Owner's include device events. */
  listActivity(server: string, profileToken: string, cursor?: string | null): Promise<ActivityPage>;
  /** Not Guest. Clears what `listActivity` shows. Proposed for Laravel (B5). */
  clearActivity(server: string, profileToken: string): Promise<void>;
  /** Owner. `date` is YYYY-MM-DD in the IANA zone `tz`. */
  getLocations(
    server: string,
    profileToken: string,
    date: string,
    tz: string,
  ): Promise<LocationDay>;
  /** Owner. */
  getLocationSettings(server: string, profileToken: string): Promise<LocationSettings>;
  /** Owner; send only the fields that change. */
  putLocationSettings(
    server: string,
    profileToken: string,
    body: Partial<LocationSettings>,
  ): Promise<LocationSettings>;

  /** Owner. */
  getAlertSettings(server: string, profileToken: string): Promise<AlertSettings>;
  /** Owner; send only the fields that change. */
  putAlertSettings(
    server: string,
    profileToken: string,
    body: Partial<AlertSettings>,
  ): Promise<AlertSettings>;
  /** Owner. Oldest first. */
  listVipContacts(server: string, profileToken: string): Promise<VipContact[]>;
  /** Owner. */
  createVipContact(server: string, profileToken: string, body: VipContactBody): Promise<VipContact>;
  /** Owner; send only the fields that change. */
  updateVipContact(
    server: string,
    profileToken: string,
    id: number,
    body: Partial<VipContactBody>,
  ): Promise<VipContact>;
  /** Owner (soft delete on Laravel). */
  deleteVipContact(server: string, profileToken: string, id: number): Promise<void>;
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
