// Input rules for the first-run forms (plan §4). Pure functions, unit tested.

/** Hosts a dev build may reach over plain http: Metro-side dev API and the emulator's host. */
const DEV_HTTP_HOSTS = ['localhost', '10.0.2.2'];

export type ServerUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'empty' | 'invalid' | 'https' };

/** Trims spaces and trailing slashes. */
export function normalizeServerUrl(input: string): string {
  return input.trim().replace(/\/+$/, '');
}

/**
 * 1.2 server address: https required; `http://localhost` and `http://10.0.2.2` only when
 * `allowDevHttp` (pass `__DEV__`).
 */
export function checkServerUrl(input: string, allowDevHttp: boolean): ServerUrlResult {
  const url = normalizeServerUrl(input);
  if (url === '') return { ok: false, reason: 'empty' };
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/\s:?#@]+)(:\d{1,5})?(\/[^\s]*)?$/i.exec(url);
  if (!match) return { ok: false, reason: 'invalid' };
  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  if (scheme === 'https') return { ok: true, url };
  if (scheme === 'http' && allowDevHttp && DEV_HTTP_HOSTS.includes(host)) return { ok: true, url };
  return { ok: false, reason: 'https' };
}

export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

export const MIN_PASSWORD_LENGTH = 8;

/** Register mode only; sign in accepts any non-empty password. */
export function isValidNewPassword(input: string): boolean {
  return input.length >= MIN_PASSWORD_LENGTH;
}

export const PIN_LENGTH = 6;

/** 1.3 PIN field and 2.2 keypad: digits only, at most 6. */
export function sanitizePin(input: string): string {
  return input.replace(/\D/g, '').slice(0, PIN_LENGTH);
}

export function isValidPin(input: string): boolean {
  return /^\d{6}$/.test(input);
}

/** 1.3 Name: at least one non-space character. */
export function isValidName(input: string): boolean {
  return input.trim() !== '';
}

/** 10.x, 172.16–31.x, 192.168.x, and `.local` or `.lan` names (plan §4.4). */
export function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h.endsWith('.local') || h.endsWith('.lan')) return true;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!ip) return false;
  const [a, b, ...rest] = ip.slice(1).map(Number);
  if ([a, b, ...rest].some((n) => n > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export type LlmUrlResult =
  | { ok: false; reason: 'empty' | 'invalid' }
  | {
      ok: true;
      url: string;
      host: string;
      /**
       * `blocked`: a release build refuses plain http to any host but HOME_LLM_HOST (§7).
       * `public`: the host isn't on a home network. Both are warnings; Save stays enabled.
       */
      warning: 'blocked' | 'public' | null;
    };

/**
 * 1.4 Home LLM server: `http://` or `https://` with a host. `homeLlmHost` is the build's
 * HOME_LLM_HOST; `release` is `!__DEV__`.
 */
export function checkLlmUrl(
  input: string,
  options: { homeLlmHost: string | null; release: boolean },
): LlmUrlResult {
  const url = normalizeServerUrl(input);
  if (url === '') return { ok: false, reason: 'empty' };
  const match = /^(https?):\/\/([^/\s:?#@]+)(:\d{1,5})?(\/[^\s]*)?$/i.exec(url);
  if (!match) return { ok: false, reason: 'invalid' };
  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  const allowedHost = options.homeLlmHost?.toLowerCase() || null;
  const warning =
    options.release && scheme === 'http' && host !== allowedHost
      ? 'blocked'
      : isPrivateHost(host)
        ? null
        : 'public';
  return { ok: true, url, host, warning };
}
