// buildConfig reads app.config.ts `extra`. Release builds embed a null value as {} (Expo's config
// serializer), so the reader must not assume a string.

function load(extra: Record<string, unknown>): typeof import('@/services/buildConfig') {
  let mod!: typeof import('@/services/buildConfig');
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra } } }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module per config
    mod = require('@/services/buildConfig');
  });
  return mod;
}

describe('buildConfig', () => {
  it('reads the home LLM host, trimmed', () => {
    expect(load({ homeLlmHost: ' 192.168.1.20 ' }).homeLlmHost).toBe('192.168.1.20');
  });

  it('treats an empty host as none', () => {
    expect(load({ homeLlmHost: '' }).homeLlmHost).toBeNull();
    expect(load({}).homeLlmHost).toBeNull();
  });

  it('survives the release build serializing null as {}', () => {
    const config = load({ homeLlmHost: {}, hasMapsKey: {} });
    expect(config.homeLlmHost).toBeNull();
    expect(config.hasMapsKey).toBe(false);
  });

  it('reads the Maps key flag', () => {
    expect(load({ hasMapsKey: true }).hasMapsKey).toBe(true);
  });
});
