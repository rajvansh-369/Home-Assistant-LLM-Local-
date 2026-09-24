// Request and response shapes for the calls in plan §6. The spec lists routes but not bodies,
// so every field name here is an assumption to check against the Laravel controllers (Phase 7).

export type ProfileRole = 'owner' | 'member' | 'guest';

export type Profile = {
  id: number;
  name: string;
  /** Hex colour, e.g. the Mint swatch value. */
  color: string;
  role: ProfileRole;
};

export type Place = {
  name: 'Home';
  address: string;
  lat: number;
  lng: number;
  radius_m: number;
  wifi_ssid: string | null;
  llm_url: string;
};

export type LoginBody = { email: string; password: string; device_name: string };
export type RegisterBody = LoginBody & { name: string };
export type TokenResponse = { token: string };

export type CreateProfileBody = {
  name: string;
  color: string;
  role: 'owner';
  pin: string;
  /** 2 when "Lock when I leave" is on, null when off. */
  auto_lock_minutes: number | null;
};

export type UpdateProfileBody = Partial<Pick<CreateProfileBody, 'name' | 'color' | 'auto_lock_minutes'>>;

export type UnlockResponse = {
  profile_token: string;
  llm_token: string;
  /** ISO 8601, 12 hours after unlock. */
  expires_at: string;
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
    options: { fieldErrors?: Record<string, string[]>; retryAfter?: number | null; timedOut?: boolean } = {},
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
  unlockProfile(server: string, deviceToken: string, id: number, pin: string): Promise<UnlockResponse>;
  /** Resolves with null on 404 (no home yet). */
  getHomePlace(server: string, profileToken: string): Promise<Place | null>;
  putHomePlace(server: string, profileToken: string, place: Place): Promise<Place>;
}

export type LlmHealth =
  | { kind: 'ready'; model: string; ms: number }
  | { kind: 'loading'; ms: number }
  | { kind: 'failed'; error: string }
  | { kind: 'no-reply' }
  | { kind: 'blocked' };

/** zypherLL health check: `GET {llmUrl}/health`, 3 s timeout, no token. */
export type LlmHealthCheck = (llmUrl: string) => Promise<LlmHealth>;
