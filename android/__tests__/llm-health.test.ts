import { healthStatus, llmFieldStatus } from '@/features/first-run/llmStatus';
import { setHome as copy } from '@/features/first-run/copy';
import { checkLlmUrl } from '@/features/first-run/validators';
import { checkLlmHealth, LLM_HEALTH_TIMEOUT_MS, parseHealth } from '@/services/llm/health';

describe('health parser', () => {
  test("zypherLL's ready reply has no model name", () => {
    const body = { status: 'ready', error: null, device: 'cuda', vram_gb: 6.0, auth: true };
    expect(parseHealth(200, body, 42)).toEqual({ kind: 'ready', model: null, ms: 42 });
  });

  test('ready with a model name', () => {
    expect(parseHealth(200, { status: 'ready', model: 'zephyr-7b' }, 12)).toEqual({
      kind: 'ready',
      model: 'zephyr-7b',
      ms: 12,
    });
  });

  test('loading', () => {
    expect(parseHealth(200, { status: 'loading', error: null }, 30)).toEqual({
      kind: 'loading',
      ms: 30,
    });
  });

  test("a failed load: zypherLL's 200 with status error, or a 500", () => {
    expect(parseHealth(200, { status: 'error', error: 'CUDA out of memory' }, 5)).toEqual({
      kind: 'failed',
      error: 'CUDA out of memory',
    });
    expect(parseHealth(500, { error: 'model failed to load' }, 5)).toEqual({
      kind: 'failed',
      error: 'model failed to load',
    });
    expect(parseHealth(500, null, 5)).toEqual({ kind: 'failed', error: 'HTTP 500' });
  });

  test('anything else is an unexpected reply', () => {
    expect(parseHealth(404, { detail: 'Not Found' }, 5)).toEqual({
      kind: 'unexpected',
      status: 404,
    });
    expect(parseHealth(200, null, 5)).toEqual({ kind: 'unexpected', status: 200 });
    expect(parseHealth(200, { status: 'sleeping' }, 5)).toEqual({
      kind: 'unexpected',
      status: 200,
    });
  });
});

describe('health check', () => {
  const fetchMock = jest.fn();
  const options = { homeLlmHost: '192.168.1.20', release: false };

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => jest.useRealTimers());

  const reply = (status: number, body: unknown) => ({
    status,
    json: async () => body,
  });

  test('calls GET {llm}/health with no token', async () => {
    fetchMock.mockResolvedValue(reply(200, { status: 'ready', error: null }));
    const result = await checkLlmHealth('http://192.168.1.20:8000/', options);
    expect(result).toMatchObject({ kind: 'ready', model: null });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://192.168.1.20:8000/health');
    expect(init.headers).toEqual({ Accept: 'application/json' });
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.signal).toBeDefined();
  });

  test('loading and 500 replies', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { status: 'loading', error: null }));
    expect(await checkLlmHealth('http://192.168.1.20:8000', options)).toMatchObject({
      kind: 'loading',
    });
    fetchMock.mockResolvedValueOnce(reply(500, { error: 'boom' }));
    expect(await checkLlmHealth('http://192.168.1.20:8000', options)).toEqual({
      kind: 'failed',
      error: 'boom',
    });
  });

  test('gives up after 3 s with no reply', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
        }),
    );
    const pending = checkLlmHealth('http://192.168.1.20:8000', options);
    jest.advanceTimersByTime(LLM_HEALTH_TIMEOUT_MS - 1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    await expect(pending).resolves.toEqual({ kind: 'no-reply' });
    expect(LLM_HEALTH_TIMEOUT_MS).toBe(3000);
  });

  test('a network error is no reply', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    expect(await checkLlmHealth('http://192.168.1.20:8000', options)).toEqual({ kind: 'no-reply' });
  });

  test('a release build blocks another http host without calling it', async () => {
    const result = await checkLlmHealth('http://192.168.1.99:8000', { ...options, release: true });
    expect(result).toEqual({ kind: 'blocked' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('status lines', () => {
  test('each test result maps to its §4.4 line and tone', () => {
    expect(healthStatus({ kind: 'ready', model: 'zephyr-7b', ms: 40 }, null)).toMatchObject({
      tone: 'accent',
      text: copy.llmReady('zephyr-7b', 40),
    });
    expect(healthStatus({ kind: 'ready', model: null, ms: 40 }, null).text).toBe('Ready · 40 ms');
    expect(healthStatus({ kind: 'loading', ms: 1 }, null)).toEqual({
      tone: 'warning',
      text: copy.llmLoading,
    });
    expect(healthStatus({ kind: 'failed', error: 'oom' }, null)).toEqual({
      tone: 'danger',
      text: 'Model failed to load: oom. Check zypherLL on your computer.',
    });
    expect(healthStatus({ kind: 'no-reply' }, null).text).toBe(
      'No reply in 3 s. Are you on home Wi-Fi?',
    );
    expect(healthStatus({ kind: 'blocked' }, '192.168.1.20').text).toBe(
      'This build only allows plain HTTP to 192.168.1.20. Use that address, or https://.',
    );
    // A trailing full stop in the server's error isn't doubled.
    expect(healthStatus({ kind: 'failed', error: 'Out of memory. ' }, null).text).toBe(
      'Model failed to load: Out of memory. Check zypherLL on your computer.',
    );
    expect(healthStatus({ kind: 'blocked' }, null).text).toBe(copy.llmBlockedAll);
    expect(healthStatus({ kind: 'unexpected', status: 404 }, null).tone).toBe('danger');
  });

  test('field warnings: public host and blocked host', () => {
    const dev = { homeLlmHost: '192.168.1.20', release: false };
    expect(
      llmFieldStatus(checkLlmUrl('http://192.168.1.20:8000', dev), '192.168.1.20'),
    ).toBeUndefined();
    expect(llmFieldStatus(checkLlmUrl('https://llm.example.com', dev), null)).toEqual({
      tone: 'warning',
      text: copy.publicLlm,
    });
    const release = { homeLlmHost: '192.168.1.20', release: true };
    const blocked = checkLlmUrl('http://192.168.1.21', release);
    expect(llmFieldStatus(blocked, '192.168.1.20')).toEqual({
      tone: 'danger',
      text: copy.llmBlocked('192.168.1.20'),
    });
    // After Test, the result line says it; the field doesn't repeat it.
    expect(llmFieldStatus(blocked, '192.168.1.20', { kind: 'blocked' })).toBeUndefined();
  });
});
