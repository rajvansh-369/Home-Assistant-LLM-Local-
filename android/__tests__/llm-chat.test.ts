// zypherLL streaming (docs/aster-home-chat-plan.md §6) against a fake expo/fetch.
import { fetch as expoFetch } from 'expo/fetch';

import { askZypher } from '@/features/chat/ask';
import { buildMessages, continueMessages, trimForMemory } from '@/features/chat/prompt';
import { resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { setMockLatency } from '@/services/api/mock';
import { ChatError, streamChat, type ChatRequest } from '@/services/llm/chat';
import { createSseParser, parseChatEvent, type ChatEvent } from '@/services/llm/sse';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/features/home-mode/controller', () => ({ checkHomeMode: jest.fn(async () => {}) }));

const fetchMock = jest.mocked(expoFetch) as unknown as jest.Mock;
const encoder = new TextEncoder();

const sse = (payload: unknown) =>
  `data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`;
const chunk = (
  delta: Record<string, unknown>,
  extra: Record<string, unknown> = {},
  finish: string | null = null,
) =>
  sse({
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...extra,
  });

const answer = [
  chunk({ role: 'assistant', content: '' }),
  chunk({}, { zypher: { stage: 'searching' } }),
  chunk({}, { zypher: { stage: 'recalled', count: 2 } }),
  chunk({ content: 'About ' }),
  chunk({ content: '1.5 hours.' }),
  chunk(
    {},
    {
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
      zypher: {
        live: true,
        cited: true,
        sources: [{ n: 1, title: 'Road trip', url: 'https://x.test' }],
        memory_id: null,
      },
    },
    'stop',
  ),
  sse('[DONE]'),
];

/** A response whose body delivers `parts` one read at a time (split mid-event on purpose). */
function streamed(
  parts: string[],
  status = 200,
  options: { failAt?: number; signal?: AbortSignal } = {},
) {
  let i = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => parts.join(''),
    body: {
      getReader: () => ({
        read: async () => {
          if (options.signal?.aborted)
            throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
          if (options.failAt === i) throw new TypeError('Network request failed');
          if (i >= parts.length) return { done: true };
          return { done: false, value: encoder.encode(parts[i++]) };
        },
      }),
    },
  };
}

function split(text: string, size: number) {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size));
  return parts;
}

const request: ChatRequest = {
  llmUrl: 'http://10.0.2.2:8000/',
  llmToken: 'llm-token',
  engine: 'local',
  messages: [{ role: 'user', content: 'How long to Lonavala?' }],
  web: 'auto',
};

beforeEach(() => fetchMock.mockReset());

describe('SSE parsing', () => {
  test('events split across reads and CRLF line ends', () => {
    const seen: string[] = [];
    const parser = createSseParser((data) => seen.push(data));
    parser.push('data: {"a"');
    parser.push(':1}\r\n\r\ndata: [DO');
    parser.push('NE]\n\n');
    parser.end();
    expect(seen).toEqual(['{"a":1}', '[DONE]']);
  });

  test('each zypherLL chunk becomes one event', () => {
    const events = answer
      .map((part) => part.replace(/^data: /, '').trim())
      .map(parseChatEvent)
      .filter(Boolean);
    expect(events).toEqual([
      { type: 'status', stage: 'searching' },
      { type: 'status', stage: 'recalled', count: 2 },
      { type: 'text', text: 'About ' },
      { type: 'text', text: '1.5 hours.' },
      {
        type: 'done',
        finishReason: 'stop',
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        meta: expect.objectContaining({ live: true, cited: true }),
      },
    ]);
    expect(parseChatEvent('{"error":{"message":"out of GPU memory"}}')).toEqual({
      type: 'error',
      message: 'out of GPU memory',
    });
    expect(
      parseChatEvent(
        JSON.stringify({
          choices: [{ delta: {} }],
          zypher: { stage: 'tool', tool: 'system_status' },
        }),
      ),
    ).toEqual({
      type: 'status',
      stage: 'tool',
      tool: 'system_status',
    });
  });
});

describe('streamChat', () => {
  test('posts the turn and streams the answer', async () => {
    fetchMock.mockResolvedValueOnce(streamed(split(answer.join(''), 37)));
    const events: ChatEvent[] = [];

    const result = await streamChat({ ...request, memory: false }, (e) => events.push(e));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://10.0.2.2:8000/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer llm-token');
    expect(JSON.parse(init.body)).toEqual({
      stream: true,
      engine: 'local',
      messages: request.messages,
      web: 'auto',
      memory: false,
    });
    expect(result).toMatchObject({ text: 'About 1.5 hours.', finishReason: 'stop' });
    expect(result.meta.sources).toHaveLength(1);
    expect(events.filter((e) => e.type === 'text')).toHaveLength(2);
  });

  test('Mark-L gets its name; Local never does', async () => {
    fetchMock.mockImplementation(async () => streamed(answer));
    await streamChat({ ...request, engine: 'markl', assistantName: 'Jarvis' }, () => {});
    await streamChat({ ...request, assistantName: 'Jarvis' }, () => {});
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).assistant_name).toBe('Jarvis');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty('assistant_name');
  });

  test.each([
    [401, 'unauthorized', '{"detail":"invalid or expired token"}'],
    [503, 'not-ready', '{"detail":"model is still loading"}'],
    [503, 'oom', '{"detail":"out of GPU memory -- send less history or lower max_tokens"}'],
    [429, 'quota', '{"detail":"quota exhausted"}'],
    [502, 'upstream', '{"detail":"Gemini said no"}'],
    [500, 'failed', 'Internal Server Error'],
  ])('HTTP %i is a %s error', async (status, kind, body) => {
    fetchMock.mockResolvedValueOnce(streamed([body], status));
    await expect(streamChat(request, () => {})).rejects.toMatchObject({ kind, status });
  });

  test('no reply at all', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(streamChat(request, () => {})).rejects.toMatchObject({ kind: 'no-reply' });
  });

  test('an error event keeps the partial answer', async () => {
    fetchMock.mockResolvedValueOnce(
      streamed([
        chunk({ content: 'Half an ans' }),
        sse({ error: { message: 'boom' } }),
        sse('[DONE]'),
      ]),
    );
    const error = await streamChat(request, () => {}).catch((e) => e);
    expect(error).toBeInstanceOf(ChatError);
    expect(error).toMatchObject({ kind: 'failed', message: 'boom', partial: 'Half an ans' });
  });

  test('Stop resolves with what arrived, as cancelled', async () => {
    const controller = new AbortController();
    const parts = [chunk({ content: 'Partial ' }), chunk({ content: 'answer' })];
    fetchMock.mockResolvedValueOnce(streamed(parts, 200, { signal: controller.signal }));

    const result = await streamChat({ ...request, signal: controller.signal }, (event) => {
      if (event.type === 'text' && event.text === 'Partial ') controller.abort();
    });

    expect(result).toMatchObject({ finishReason: 'cancelled' });
    expect(result.text.startsWith('Partial ')).toBe(true);
  });

  test('a stream that ends without its last chunk is an error', async () => {
    fetchMock.mockResolvedValueOnce(streamed([chunk({ content: 'Cut' })]));
    await expect(streamChat(request, () => {})).rejects.toMatchObject({
      kind: 'no-reply',
      partial: 'Cut',
    });
  });
});

describe('askZypher retries', () => {
  beforeAll(() => setMockLatency(0, 0));

  beforeEach(async () => {
    await resetFirstRun();
    await signIn({ server: 'https://aster.test', email: 'owner@example.test', password: 'pw' });
    await unlockOwner('123456');
    useFirstRunStore.getState().set({
      home: {
        address: 'x',
        lat: 1,
        lng: 2,
        radius_m: 150,
        wifi_ssid: null,
        llm_url: 'http://10.0.2.2:8000',
      },
    });
  });

  test('a 401 gets a fresh llm_token and retries once', async () => {
    const before = useFirstRunStore.getState().session!.llmToken;
    fetchMock
      .mockResolvedValueOnce(streamed(['{"detail":"invalid or expired token"}'], 401))
      .mockResolvedValueOnce(streamed(answer));

    const result = await askZypher({ messages: request.messages, web: 'auto', onEvent: () => {} });

    expect(result.text).toBe('About 1.5 hours.');
    const after = useFirstRunStore.getState().session!.llmToken;
    expect(after).not.toBe(before);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${after}`);
  });

  test('out of GPU memory retries with less history and max_tokens 1024', async () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      content: `turn ${i}`,
    }));
    const messages = buildMessages({ personality: 'Be brief.', history, question: 'Now?' });
    fetchMock
      .mockResolvedValueOnce(streamed(['{"detail":"out of GPU memory -- send less history"}'], 503))
      .mockResolvedValueOnce(streamed(answer));

    await askZypher({ messages, web: 'auto', onEvent: () => {} });

    const retry = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retry.max_tokens).toBe(1024);
    expect(retry.messages).toHaveLength(1 + 4 + 1);
    expect(retry.messages[0]).toEqual({ role: 'system', content: 'Be brief.' });
    expect(retry.messages.at(-1)).toEqual({ role: 'user', content: 'Now?' });
  });

  test('uses the profile engine and Mark-L name', async () => {
    useFirstRunStore.getState().set({
      llmEngine: 'markl',
      engines: [
        { id: 'local', name: 'Local' },
        { id: 'markl', name: 'Jarvis' },
      ],
    });
    fetchMock.mockResolvedValueOnce(streamed(answer));
    await askZypher({ messages: request.messages, web: false, onEvent: () => {} });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      engine: 'markl',
      assistant_name: 'Jarvis',
      web: false,
    });
  });
});

describe('prompt', () => {
  test('personality, the last 10 messages, then the question', () => {
    const history = Array.from({ length: 14 }, (_, i) => ({
      role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      content: i === 13 ? '' : `m${i}`,
    }));
    const messages = buildMessages({ personality: ' Friendly. ', history, question: 'Q' });
    expect(messages[0]).toEqual({ role: 'system', content: 'Friendly.' });
    expect(messages.slice(1, -1).map((m) => m.content)).toEqual([
      'm3',
      'm4',
      'm5',
      'm6',
      'm7',
      'm8',
      'm9',
      'm10',
      'm11',
      'm12',
    ]);
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'Q' });
    expect(buildMessages({ history: [], question: 'Q' })).toEqual([{ role: 'user', content: 'Q' }]);
  });

  test('continue appends the partial answer; trimming keeps the system message', () => {
    const base = buildMessages({ personality: 'P', history: [], question: 'Q' });
    expect(continueMessages(base, 'half').at(-1)).toEqual({ role: 'assistant', content: 'half' });
    expect(trimForMemory(base)).toEqual(base);
  });
});
