import {
  modeFromHealth,
  modelLabel,
  nextCheckMs,
  presence,
  WIFI_GRACE_MS,
  type HomeSignals,
} from '@/features/home-mode/mode';
import type { LlmHealth } from '@/services/api';
import { parseHealth } from '@/services/llm/health';

const server = (engines: Record<string, string>, engine = 'local', busy = false) => ({
  server: { engines, engine, busy },
});

describe('modeFromHealth', () => {
  test.each<[string, LlmHealth, 'local' | 'markl', string]>([
    ['no reply', { kind: 'no-reply' }, 'local', 'noServer'],
    ['wrong port', { kind: 'unexpected', status: 404 }, 'local', 'noServer'],
    ['release build refuses the host', { kind: 'blocked' }, 'local', 'noServer'],
    ['old server, ready', { kind: 'ready', model: null, ms: 5 }, 'local', 'ready'],
    ['old server, loading', { kind: 'loading', ms: 5 }, 'markl', 'loading'],
    ['old server, failed', { kind: 'failed', error: 'CUDA' }, 'local', 'failed'],
    [
      'Zephyr loading, profile on Mark-L which is ready',
      { kind: 'loading', ms: 5, ...server({ local: 'loading', markl: 'ready' }) },
      'markl',
      'ready',
    ],
    [
      'Zephyr loading, profile on Local',
      { kind: 'loading', ms: 5, ...server({ local: 'loading', markl: 'ready' }) },
      'local',
      'loading',
    ],
    [
      'Mark-L has no key',
      {
        kind: 'ready',
        model: 'zephyr-7b',
        ms: 5,
        ...server({ local: 'ready', markl: 'unconfigured' }),
      },
      'markl',
      'failed',
    ],
  ])('%s', (_name, health, engine, kind) => {
    expect(modeFromHealth(health, engine).kind).toBe(kind);
  });

  test('ready says when the home PC is answering someone else', () => {
    const health = {
      kind: 'ready' as const,
      model: null,
      ms: 1,
      ...server({ local: 'ready' }, 'local', true),
    };
    expect(modeFromHealth(health, 'local')).toEqual({ kind: 'ready', busy: true });
  });

  test("a failed default engine keeps the server's error", () => {
    const health: LlmHealth = {
      kind: 'failed',
      error: 'model failed to load: out of memory',
      ...server({ local: 'error', markl: 'ready' }),
    };
    expect(modeFromHealth(health, 'local')).toEqual({
      kind: 'failed',
      error: 'model failed to load: out of memory',
    });
    expect(modeFromHealth(health, 'markl').kind).toBe('ready');
  });
});

test('parseHealth reads engines, the default engine and busy', () => {
  const body = {
    status: 'loading',
    error: null,
    engine: 'local',
    model: 'zephyr-7b',
    engines: { local: 'loading', markl: 'ready' },
    busy: true,
  };
  expect(parseHealth(200, body, 9)).toEqual({
    kind: 'loading',
    ms: 9,
    server: { engines: { local: 'loading', markl: 'ready' }, engine: 'local', busy: true },
  });
});

describe('presence', () => {
  const signals = (patch: Partial<HomeSignals> = {}): HomeSignals => ({
    onHomeWifi: false,
    inside: null,
    leftArea: false,
    ...patch,
  });
  const now = 1_000_000;

  test('home Wi-Fi or the home area is home', () => {
    expect(presence(signals({ onHomeWifi: true }), false, null, now)).toEqual({ kind: 'home' });
    expect(presence(signals({ inside: true }), false, null, now)).toEqual({ kind: 'home' });
  });

  test('nothing points home: away', () => {
    expect(presence(signals(), false, null, now)).toEqual({ kind: 'away' });
  });

  test('losing home Wi-Fi waits 2 minutes before Away', () => {
    expect(presence(signals(), true, null, now)).toEqual({
      kind: 'grace',
      until: now + WIFI_GRACE_MS,
    });
    expect(presence(signals(), true, now - WIFI_GRACE_MS + 1, now).kind).toBe('grace');
    expect(presence(signals(), true, now - WIFI_GRACE_MS, now)).toEqual({ kind: 'away' });
  });

  test('leaving the area is Away at once', () => {
    expect(presence(signals({ inside: false, leftArea: true }), true, null, now)).toEqual({
      kind: 'away',
    });
  });
});

test('checks every 10 s while loading, every minute otherwise, never in a loop after a failure', () => {
  expect(nextCheckMs({ kind: 'loading' })).toBe(10_000);
  expect(nextCheckMs({ kind: 'noServer' })).toBe(60_000);
  expect(nextCheckMs({ kind: 'ready', busy: false })).toBe(60_000);
  expect(nextCheckMs({ kind: 'failed', error: 'x' })).toBeNull();
});

test('model labels: the local model id, or Mark-L by its admin-panel name', () => {
  const engines = [
    { id: 'local' as const, name: 'Local' },
    { id: 'markl' as const, name: 'Jarvis' },
  ];
  expect(modelLabel('local', engines)).toBe('zephyr-7b');
  expect(modelLabel('markl', engines)).toBe('Jarvis');
});
