// zypherLL health check for the 1.4 Test pill (plan §4.4, §6). Always a real fetch, mock mode
// included: the home LLM isn't part of the mock server.
import { checkLlmUrl } from '@/features/first-run/validators';
import type { HealthServer, LlmEngine, LlmHealth } from '@/services/api/types';
import { homeLlmHost, isReleaseBuild } from '@/services/buildConfig';

export const LLM_HEALTH_TIMEOUT_MS = 3000;

/** zypherLL's model id for the local engine (`MODEL_ID` in llm/zypher/config.py). */
export const LOCAL_MODEL_ID = 'zephyr-7b';

type HealthOptions = {
  homeLlmHost: string | null;
  release: boolean;
  timeoutMs: number;
};

const defaults: HealthOptions = {
  homeLlmHost,
  release: isReleaseBuild,
  timeoutMs: LLM_HEALTH_TIMEOUT_MS,
};

const text = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** `engines`, `engine` and `busy`, when the server sends them (zypherLL with Mark-L). */
function serverInfo(data: Record<string, unknown>): { server?: HealthServer } {
  if (typeof data.engines !== 'object' || data.engines === null) return {};
  const engines: Record<string, string> = {};
  for (const [name, state] of Object.entries(data.engines as Record<string, unknown>)) {
    if (typeof state === 'string') engines[name] = state;
  }
  return { server: { engines, engine: text(data.engine), busy: data.busy === true } };
}

/**
 * Reads a `/health` reply. zypherLL answers 200 `{ status: "loading" | "ready" | "error", error }`
 * with no model name; the plan (§6) also expects `model` and a 500 for a failed load, so both
 * shapes are accepted.
 */
export function parseHealth(status: number, body: unknown, ms: number): LlmHealth {
  const data = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const error = text(data.error) ?? text(data.message) ?? text(data.detail);
  const server = serverInfo(data);
  if (status >= 500 || (status === 200 && data.status === 'error')) {
    return { kind: 'failed', error: error ?? `HTTP ${status}`, ms, ...server };
  }
  if (status === 200 && data.status === 'ready')
    return { kind: 'ready', model: text(data.model), ms, ...server };
  if (status === 200 && data.status === 'loading') return { kind: 'loading', ms, ...server };
  return { kind: 'unexpected', status };
}

/**
 * The `/health` result for one engine. zypherLL with Mark-L reports each engine in `engines`, and
 * its top-level `status` is only the default engine's: a PC with Zephyr switched off but Mark-L
 * ready is ready for a profile on Mark-L. `engineName` is what to call Mark-L (its admin-panel
 * name); Local is named by its model id.
 */
export function healthForEngine(
  health: LlmHealth,
  engine: LlmEngine,
  engineName: string,
): LlmHealth {
  if (health.kind !== 'ready' && health.kind !== 'loading' && health.kind !== 'failed')
    return health;
  const state = health.server?.engines[engine];
  if (state === undefined) return health;
  const ms = health.ms ?? 0;
  if (state === 'ready') {
    const model =
      engine === 'local'
        ? health.server!.engine === 'local' && health.kind === 'ready'
          ? (health.model ?? LOCAL_MODEL_ID)
          : LOCAL_MODEL_ID
        : engineName;
    return { kind: 'ready', model, ms, server: health.server };
  }
  if (state === 'loading') return { kind: 'loading', ms, server: health.server };
  const own = health.kind === 'failed' && health.server!.engine === engine;
  return {
    kind: 'failed',
    error: own ? health.error : `${engineName}: ${state}`,
    server: health.server,
  };
}

/** `GET {llmUrl}/health`, no token, 3 s timeout covering the body too. */
export async function checkLlmHealth(
  llmUrl: string,
  options: Partial<HealthOptions> = {},
): Promise<LlmHealth> {
  const { timeoutMs, ...urlOptions } = { ...defaults, ...options };
  const checked = checkLlmUrl(llmUrl, urlOptions);
  if (!checked.ok) return { kind: 'unexpected', status: 0 };
  // A release build refuses this host before any request; fetch would only say "failed".
  if (checked.warning === 'blocked') return { kind: 'blocked' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${checked.url}/health`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    return parseHealth(response.status, body, Date.now() - started);
  } catch {
    return { kind: 'no-reply' };
  } finally {
    clearTimeout(timer);
  }
}
