// The real Laravel client (plan Phase 7) against a fake fetch: URLs, headers, the `data`
// wrapper, and every failure mapped into one ApiError.
import { realApi, TIMEOUT_MS, UP_TIMEOUT_MS } from '@/services/api/client';
import { ApiError } from '@/services/api/types';

type FakeReply = { status: number; body?: unknown; headers?: Record<string, string> };

const server = 'https://aster.test/';
const fetchMock = jest.fn();

function reply({ status, body, headers = {} }: FakeReply) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => lower[name.toLowerCase()] ?? null },
    text: async () => text,
  };
}

const answer = (r: FakeReply) => fetchMock.mockResolvedValueOnce(reply(r));

/** A fetch that never answers, and rejects like React Native's once its signal aborts. */
function hang() {
  fetchMock.mockImplementationOnce(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new TypeError('Aborted')));
      }),
  );
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => jest.useRealTimers());

describe('requests', () => {
  test('login posts JSON to {server}/api with Accept and no token', async () => {
    answer({ status: 200, body: { token: 'dev-token', household_id: 'h1' } });

    const body = { email: 'a@example.test', password: 'pw', device_name: 'Google Pixel 7' };
    expect(await realApi.login(server, body)).toMatchObject({ token: 'dev-token' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://aster.test/api/auth/login');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual(body);
  });

  test('device and profile calls carry their bearer token and unwrap `data`', async () => {
    const profiles = [{ id: 1, name: 'Owner', color: '#7FD9B8', role: 'owner' }];
    answer({ status: 200, body: { data: profiles } });
    expect(await realApi.listProfiles(server, 'dev-token')).toEqual(profiles);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer dev-token',
    });
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();

    answer({ status: 200, body: { data: { ...profiles[0], llm_engine: 'markl' } } });
    await realApi.updateProfile(server, 'profile-token', 1, { llm_engine: 'markl' });
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('https://aster.test/api/profiles/1');
    expect(init.method).toBe('PATCH');
    expect(init.headers.Authorization).toBe('Bearer profile-token');
  });

  test('unlock returns the body as is (no `data` wrapper)', async () => {
    const body = {
      profile_token: 'p',
      llm_token: 'l',
      expires_at: '2026-09-27T20:00:00Z',
      household_id: 'h1',
      profile: { id: 1, name: 'Owner', color: '#7FD9B8', role: 'owner', llm_engine: 'local' },
      engines: [{ id: 'local', name: 'Local' }],
    };
    answer({ status: 200, body });
    expect(await realApi.unlockProfile(server, 'dev-token', 1, '123456')).toEqual(body);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ pin: '123456' });
  });

  test('GET /places/home: 404 means no home yet; other failures still throw', async () => {
    answer({ status: 404, body: { message: 'No home is saved yet.' } });
    expect(await realApi.getHomePlace(server, 'p')).toBeNull();

    answer({ status: 403, body: { message: 'This needs an unlocked profile.' } });
    expect((await failure(realApi.getHomePlace(server, 'p'))).status).toBe(403);
  });

  test('the server check is GET {server}/up, outside /api', async () => {
    answer({ status: 200, body: '<!DOCTYPE html><html>up</html>' });
    const { ms } = await realApi.checkServer(server);
    expect(ms).toBeGreaterThanOrEqual(0);
    expect(fetchMock.mock.calls[0][0]).toBe('https://aster.test/up');

    answer({ status: 503, body: '<html>down</html>' });
    const error = await failure(realApi.checkServer(server));
    expect(error.status).toBe(503);
    expect(error.message).toBe('HTTP 503');
  });
});

describe('errors', () => {
  test("Laravel's 422 shape becomes field errors", async () => {
    answer({
      status: 422,
      body: {
        message: 'The email has already been taken. (and 1 more error)',
        errors: {
          email: ['The email has already been taken.'],
          password: ['The password field must be at least 8 characters.'],
        },
      },
    });
    const body = { name: 'A', email: 'a@example.test', password: 'short', device_name: 'x' };
    const error = await failure(realApi.register(server, body));

    expect(error.status).toBe(422);
    expect(error.messageFor('email')).toBe('The email has already been taken.');
    expect(error.messageFor('password')).toBe('The password field must be at least 8 characters.');
    // A field without its own error falls back to the top-level message.
    expect(error.messageFor('name')).toBe('The email has already been taken. (and 1 more error)');
  });

  test('429 takes retry_after from the body, else the Retry-After header', async () => {
    answer({
      status: 429,
      body: { message: 'Too many wrong PINs. Try again in 30 s.', retry_after: 30 },
      headers: { 'Retry-After': '99' },
    });
    expect((await failure(realApi.unlockProfile(server, 'd', 1, '000000'))).retryAfter).toBe(30);

    answer({ status: 429, body: { message: 'Too Many Attempts.' }, headers: { 'Retry-After': '42' } });
    const error = await failure(realApi.login(server, { email: 'a@b.cd', password: 'x', device_name: 'x' }));
    expect(error.status).toBe(429);
    expect(error.retryAfter).toBe(42);
  });

  test('401, 403 and 5xx keep their status; a non-JSON body still gives a message', async () => {
    answer({ status: 401, body: { message: 'Unauthenticated.' } });
    const unauthenticated = await failure(realApi.listProfiles(server, 'old-token'));
    expect(unauthenticated).toMatchObject({ status: 401, message: 'Unauthenticated.', retryAfter: null });

    answer({ status: 403, body: { message: 'This needs a device token.' } });
    expect((await failure(realApi.listProfiles(server, 'profile-token'))).status).toBe(403);

    answer({ status: 500, body: '<html>Server Error</html>' });
    const serverError = await failure(realApi.listProfiles(server, 'd'));
    expect(serverError).toMatchObject({ status: 500, message: 'HTTP 500', fieldErrors: {} });
  });

  test('no reply is status 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    const error = await failure(realApi.listProfiles(server, 'd'));
    expect(error).toMatchObject({ status: 0, timedOut: false });
  });

  test('Laravel calls time out after 15 s', async () => {
    jest.useFakeTimers();
    hang();
    const pending = failure(realApi.listProfiles(server, 'd'));

    await jest.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect(await pending).toMatchObject({ status: 0, timedOut: true });
  });

  test('the server check times out after 5 s', async () => {
    jest.useFakeTimers();
    hang();
    const pending = failure(realApi.checkServer(server));

    await jest.advanceTimersByTimeAsync(UP_TIMEOUT_MS);

    expect(await pending).toMatchObject({ status: 0, timedOut: true });
  });
});
