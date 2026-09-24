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
