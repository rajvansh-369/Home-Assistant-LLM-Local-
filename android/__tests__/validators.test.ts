import {
  checkLlmUrl,
  checkServerUrl,
  isPrivateHost,
  isValidEmail,
  isValidName,
  isValidNewPassword,
  isValidPin,
  normalizeServerUrl,
  sanitizePin,
} from '@/features/first-run/validators';

describe('server address', () => {
  test('trims spaces and trailing slashes', () => {
    expect(normalizeServerUrl('  https://aster.example.com///  ')).toBe('https://aster.example.com');
    expect(checkServerUrl(' https://aster.example.com/ ', false)).toEqual({
      ok: true,
      url: 'https://aster.example.com',
    });
  });

  test('accepts https with a port and a path', () => {
    expect(checkServerUrl('https://example.com:8443/aster', false).ok).toBe(true);
    expect(checkServerUrl('HTTPS://Example.com', false).ok).toBe(true);
  });

  test('requires https', () => {
    expect(checkServerUrl('http://aster.example.com', false)).toEqual({ ok: false, reason: 'https' });
    expect(checkServerUrl('http://aster.example.com', true)).toEqual({ ok: false, reason: 'https' });
    expect(checkServerUrl('ftp://aster.example.com', true)).toEqual({ ok: false, reason: 'https' });
  });

  test('allows http only for localhost and 10.0.2.2 in dev', () => {
    expect(checkServerUrl('http://localhost:8000', true).ok).toBe(true);
    expect(checkServerUrl('http://10.0.2.2:8000/', true)).toEqual({ ok: true, url: 'http://10.0.2.2:8000' });
    expect(checkServerUrl('http://localhost:8000', false)).toEqual({ ok: false, reason: 'https' });
    expect(checkServerUrl('http://10.0.2.2', false)).toEqual({ ok: false, reason: 'https' });
    expect(checkServerUrl('http://192.168.1.20', true)).toEqual({ ok: false, reason: 'https' });
  });

  test('rejects empty and malformed input', () => {
    expect(checkServerUrl('   ', false)).toEqual({ ok: false, reason: 'empty' });
    expect(checkServerUrl('aster.example.com', false)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkServerUrl('https://', false)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkServerUrl('https://exa mple.com', false)).toEqual({ ok: false, reason: 'invalid' });
  });
});

test('email', () => {
  expect(isValidEmail('you@example.com')).toBe(true);
  expect(isValidEmail(' you@example.com ')).toBe(true);
  expect(isValidEmail('you@example')).toBe(false);
  expect(isValidEmail('you example.com')).toBe(false);
  expect(isValidEmail('')).toBe(false);
});

test('new password needs 8 characters', () => {
  expect(isValidNewPassword('1234567')).toBe(false);
  expect(isValidNewPassword('12345678')).toBe(true);
});

describe('PIN', () => {
  test('keeps digits only, at most 6', () => {
    expect(sanitizePin('12a3 4-5')).toBe('12345');
    expect(sanitizePin('12345678')).toBe('123456');
    expect(sanitizePin('')).toBe('');
  });

  test('is valid only with exactly 6 digits', () => {
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('1234567')).toBe(false);
    expect(isValidPin('12345a')).toBe(false);
  });
});

test('name needs a non-space character', () => {
  expect(isValidName('  ')).toBe(false);
  expect(isValidName(' A ')).toBe(true);
});

describe('home LLM address', () => {
  const dev = { homeLlmHost: '192.168.1.20', release: false };
  const release = { homeLlmHost: '192.168.1.20', release: true };

  test('private hosts: 10.x, 172.16–31.x, 192.168.x, .local and .lan', () => {
    for (const host of ['10.0.2.2', '172.16.0.1', '172.31.255.255', '192.168.1.20', 'pc.local', 'PC.LAN']) {
      expect(isPrivateHost(host)).toBe(true);
    }
    for (const host of ['172.15.0.1', '172.32.0.1', '192.169.1.1', '8.8.8.8', 'example.com', 'local', '10.0.0.256']) {
      expect(isPrivateHost(host)).toBe(false);
    }
  });

  test('needs http or https with a host', () => {
    expect(checkLlmUrl('  ', dev)).toEqual({ ok: false, reason: 'empty' });
    expect(checkLlmUrl('192.168.1.20:8000', dev)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkLlmUrl('ftp://192.168.1.20', dev)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkLlmUrl('http://', dev)).toEqual({ ok: false, reason: 'invalid' });
    expect(checkLlmUrl(' http://192.168.1.20:8000/ ', dev)).toEqual({
      ok: true,
      url: 'http://192.168.1.20:8000',
      host: '192.168.1.20',
      warning: null,
    });
    expect(checkLlmUrl('https://llm.lan', dev)).toMatchObject({ ok: true, warning: null });
  });

  test('warns about a public host', () => {
    expect(checkLlmUrl('https://llm.example.com', dev)).toMatchObject({ ok: true, warning: 'public' });
    expect(checkLlmUrl('http://8.8.8.8:8000', dev)).toMatchObject({ ok: true, warning: 'public' });
  });

  test('a release build blocks plain http to any host but HOME_LLM_HOST', () => {
    expect(checkLlmUrl('http://192.168.1.20:8000', release)).toMatchObject({ warning: null });
    expect(checkLlmUrl('http://192.168.1.21:8000', release)).toMatchObject({ ok: true, warning: 'blocked' });
    expect(checkLlmUrl('https://192.168.1.21', release)).toMatchObject({ warning: null });
    expect(checkLlmUrl('http://192.168.1.20', { homeLlmHost: null, release: true })).toMatchObject({
      warning: 'blocked',
    });
    // Debug builds allow any http host.
    expect(checkLlmUrl('http://192.168.1.21:8000', dev)).toMatchObject({ warning: null });
  });
});
