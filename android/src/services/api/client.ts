// The real Laravel API (plan §6, Phase 7). Every call goes to {server}/api with JSON in and out,
// `Accept: application/json` (so Laravel answers errors in JSON too), the route's bearer token and
// a 15 s timeout (5 s for GET /up). Every failure becomes one ApiError: status 0 for no reply,
// Laravel's 422 field errors, and the 429 wait from `retry_after` or the Retry-After header.
import {
  ApiError,
  type AsterApi,
  type Place,
  type Profile,
  type TokenResponse,
  type UnlockResponse,
} from './types';

export const TIMEOUT_MS = 15_000;
export const UP_TIMEOUT_MS = 5_000;

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type RequestOptions = { token?: string; body?: unknown; timeoutMs?: number };

type Reply = { status: number; json: unknown };

/** `https://x.test/` and `https://x.test` both give `https://x.test/api/…`. */
export function apiUrl(server: string, path: string): string {
  return `${server.trim().replace(/\/+$/, '')}${path}`;
}

async function send(server: string, method: Method, path: string, options: RequestOptions): Promise<Reply> {
  const { token, body, timeoutMs = TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(apiUrl(server, path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    // Read the body inside the timeout too: a server can send headers and then stall.
    const text = await response.text();
    const reply = { status: response.status, json: parseJson(text) };
    if (!response.ok) throw toApiError(reply, response.headers.get('retry-after'));
    return reply;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const timedOut = controller.signal.aborted;
    throw new ApiError(0, timedOut ? 'Timed out' : 'Network request failed', { timedOut });
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toApiError({ status, json }: Reply, retryAfterHeader: string | null): ApiError {
  const body = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const message = typeof body.message === 'string' && body.message ? body.message : `HTTP ${status}`;

  const fieldErrors: Record<string, string[]> = {};
  if (body.errors && typeof body.errors === 'object') {
    for (const [field, messages] of Object.entries(body.errors as Record<string, unknown>)) {
      if (Array.isArray(messages)) fieldErrors[field] = messages.filter((m) => typeof m === 'string');
    }
  }

  const fromBody = typeof body.retry_after === 'number' ? body.retry_after : null;
  const fromHeader = retryAfterHeader != null ? Number.parseInt(retryAfterHeader, 10) : NaN;
  const retryAfter = fromBody ?? (Number.isFinite(fromHeader) ? fromHeader : null);

  return new ApiError(status, message, { fieldErrors, retryAfter });
}

/** Laravel API resources wrap one record, or a list, in `data`. */
function data<T>(reply: Reply): T {
  return (reply.json as { data: T }).data;
}

const call = (server: string, method: Method, path: string, options: RequestOptions = {}) =>
  send(server, method, `/api${path}`, options);

export const realApi: AsterApi = {
  async checkServer(server) {
    const started = Date.now();
    await send(server, 'GET', '/up', { timeoutMs: UP_TIMEOUT_MS });
    return { ms: Date.now() - started };
  },

  async login(server, body) {
    return (await call(server, 'POST', '/auth/login', { body })).json as TokenResponse;
  },

  async register(server, body) {
    return (await call(server, 'POST', '/auth/register', { body })).json as TokenResponse;
  },

  async listProfiles(server, deviceToken) {
    return data<Profile[]>(await call(server, 'GET', '/profiles', { token: deviceToken }));
  },

  async createProfile(server, deviceToken, body) {
    return data<Profile>(await call(server, 'POST', '/profiles', { token: deviceToken, body }));
  },

  async updateProfile(server, profileToken, id, body) {
    return data<Profile>(await call(server, 'PATCH', `/profiles/${id}`, { token: profileToken, body }));
  },

  async unlockProfile(server, deviceToken, id, pin) {
    const reply = await call(server, 'POST', `/profiles/${id}/unlock`, { token: deviceToken, body: { pin } });
    return reply.json as UnlockResponse;
  },

  async getHomePlace(server, profileToken) {
    try {
      return data<Place>(await call(server, 'GET', '/places/home', { token: profileToken }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async putHomePlace(server, profileToken, place) {
    return data<Place>(await call(server, 'PUT', '/places/home', { token: profileToken, body: place }));
  },
};
