// zypherLL health check for the 1.4 Test pill (plan §4.4, §6). Always a real fetch, mock mode
// included: the home LLM isn't part of the mock server.
import { checkLlmUrl } from '@/features/first-run/validators';
import type { LlmHealth } from '@/services/api/types';
import { homeLlmHost, isReleaseBuild } from '@/services/buildConfig';

export const LLM_HEALTH_TIMEOUT_MS = 3000;

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

/**
 * Reads a `/health` reply. zypherLL answers 200 `{ status: "loading" | "ready" | "error", error }`
 * with no model name; the plan (§6) also expects `model` and a 500 for a failed load, so both
 * shapes are accepted.
 */
export function parseHealth(status: number, body: unknown, ms: number): LlmHealth {
  const data = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const error = text(data.error) ?? text(data.message) ?? text(data.detail);
  if (status >= 500 || (status === 200 && data.status === 'error')) {
    return { kind: 'failed', error: error ?? `HTTP ${status}` };
  }
  if (status === 200 && data.status === 'ready')
    return { kind: 'ready', model: text(data.model), ms };
  if (status === 200 && data.status === 'loading') return { kind: 'loading', ms };
  return { kind: 'unexpected', status };
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
