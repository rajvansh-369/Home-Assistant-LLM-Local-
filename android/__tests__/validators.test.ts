import {
  checkServerUrl,
  isValidEmail,
  isValidNewPassword,
  normalizeServerUrl,
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
