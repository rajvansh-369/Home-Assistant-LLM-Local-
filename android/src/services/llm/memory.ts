// zypherLL memory for 5.2 Memory and activity (docs/aster-profiles-memory-plan.md §3): the
// unlocked profile's notes and learned answers on the home PC, with its llm_token. The token's
// `scope` picks the profile's folder; `engine` picks Zephyr's memory or Mark-L's. Always a real
// fetch, mock mode included, like /health. Never logs the token or a note.
import type { LlmEngine } from '@/services/api/types';

export const MEMORY_TIMEOUT_MS = 10_000;

/** How many notes 5.2 lists; zypherLL keeps them short, so one page is enough. */
export const NOTES_LIMIT = 100;

export type MemoryAccess = { llmUrl: string; llmToken: string; engine: LlmEngine };

export type MemoryOverview = {
  /** Notes about the profile. */
  notes: number;
  /** Answers learned from chats; Mark-L keeps none. */
  exchanges: number;
  /** Learned answers rated good or bad. */
  rated: number;
  /** False while the memory store still loads on the home PC. */
  ready: boolean;
};

export type MemoryNote = { id: number; text: string; at: string | null };

export type MemoryErrorKind =
  /** 401: the llm_token expired or doesn't belong to this home PC. */
  | 'unauthorized'
  /** 403: the profile's memory is off (the llm_token's `memory` claim). */
  | 'off'
  /** 404: the note is already gone. */
  | 'not-found'
  /** 503: the model or the memory store isn't loaded. */
  | 'not-ready'
  | 'no-reply'
  | 'failed';

export class MemoryError extends Error {
  readonly kind: MemoryErrorKind;
  readonly status: number;

  constructor(kind: MemoryErrorKind, message: string, status = 0) {
    super(message);
    this.name = 'MemoryError';
    this.kind = kind;
    this.status = status;
  }
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

let fetchImpl: FetchLike = (url, init) => fetch(url, init);

/** Tests swap the transport. */
export function setMemoryFetch(impl: FetchLike | null) {
  fetchImpl = impl ?? ((url, init) => fetch(url, init));
}

function kindFor(status: number): MemoryErrorKind {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'off';
  if (status === 404) return 'not-found';
  if (status === 503) return 'not-ready';
  return 'failed';
}

function parse(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function send(
  access: MemoryAccess,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  query: Record<string, string | number> = {},
  body?: unknown,
): Promise<unknown> {
  const params = new URLSearchParams({ engine: access.engine });
  for (const [key, value] of Object.entries(query)) params.set(key, String(value));
  const url = `${access.llmUrl.replace(/\/+$/, '')}${path}?${params.toString()}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${access.llmToken}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MEMORY_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const json = parse(await response.text());
    if (!response.ok) {
      const detail = (json as { detail?: unknown } | null)?.detail;
      const message = typeof detail === 'string' ? detail : `HTTP ${response.status}`;
      throw new MemoryError(kindFor(response.status), message, response.status);
    }
    return json;
  } catch (error) {
    if (error instanceof MemoryError) throw error;
    throw new MemoryError('no-reply', 'No reply from the home server.');
  } finally {
    clearTimeout(timer);
  }
}

const count = (value: unknown) => (typeof value === 'number' && value >= 0 ? value : 0);

/** `GET /v1/memory`: how much the profile's memory holds. */
export async function memoryOverview(access: MemoryAccess): Promise<MemoryOverview> {
  const json = (await send(access, 'GET', '/v1/memory')) as { stats?: unknown } | null;
  const stats = (json?.stats ?? {}) as Record<string, unknown>;
  return {
    notes: count(stats.notes),
    exchanges: count(stats.exchanges),
    rated: count(stats.rated),
    ready: stats.ready !== false,
  };
}

/** A record of `/v1/memory/records` or `/v1/memory/notes` as a note; the text is in `a`. */
function toNote(record: unknown): MemoryNote | null {
  if (typeof record !== 'object' || record === null) return null;
  const { id, a, ts } = record as Record<string, unknown>;
  if (typeof id !== 'number' || typeof a !== 'string' || a.trim() === '') return null;
  return { id, text: a.trim(), at: typeof ts === 'string' ? ts : null };
}

/** `GET /v1/memory/records?kind=note`: newest first. */
export async function listNotes(access: MemoryAccess): Promise<MemoryNote[]> {
  const json = (await send(access, 'GET', '/v1/memory/records', {
    kind: 'note',
    limit: NOTES_LIMIT,
  })) as { records?: unknown } | null;
  const records = Array.isArray(json?.records) ? json.records : [];
  return records.map(toNote).filter((note): note is MemoryNote => note !== null);
}

/** `POST /v1/memory/notes`. 503 when memory can't take it (off or not loaded). */
export async function addNote(access: MemoryAccess, text: string): Promise<MemoryNote> {
  const note = toNote(await send(access, 'POST', '/v1/memory/notes', {}, { text: text.trim() }));
  if (!note) throw new MemoryError('failed', 'The home server sent no note.');
  return note;
}

/** `DELETE /v1/memory/{id}`: only that record, never similar ones. */
export async function forgetRecord(access: MemoryAccess, id: number): Promise<void> {
  await send(access, 'DELETE', `/v1/memory/${id}`);
}

/** `DELETE /v1/memory?selector=all`: every note and learned answer. Returns how many. */
export async function forgetAll(access: MemoryAccess): Promise<number> {
  const json = (await send(access, 'DELETE', '/v1/memory', { selector: 'all' })) as {
    removed?: unknown;
  } | null;
  return count(json?.removed);
}
