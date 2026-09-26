// modules/aster-system without its native side (Expo Go, or a build older than Phase 6): the app
// must still load, with nothing allowed and no settings screen opening.
jest.unmock('../modules/aster-system');
jest.mock('expo', () => ({ requireOptionalNativeModule: () => null }));

test('falls back to a stand-in and warns in dev', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  let AsterSystem!: typeof import('../modules/aster-system').default;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- load after the spy
    AsterSystem = require('../modules/aster-system').default;
  });

  expect(AsterSystem.isNotificationListenerEnabled()).toBe(false);
  expect(AsterSystem.openNotificationListenerSettings()).toBe(false);
  expect(AsterSystem.isIgnoringBatteryOptimizations()).toBe(false);
  expect(AsterSystem.requestIgnoreBatteryOptimizations()).toBe(false);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('AsterSystem native module missing'));
  warn.mockRestore();
});
