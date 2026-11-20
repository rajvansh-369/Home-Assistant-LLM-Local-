// Voice V4 (docs/aster-voice-plan.md §6, §7): when "Hey Aster" may listen, what the service is
// told, and the controller that starts and stops it (3.6's hold is in voice-intents-screen). The
// native service is the module's Jest mock.
import { act } from '@testing-library/react-native';
import { AppState, PermissionsAndroid } from 'react-native';

import AsterSystem from '../modules/aster-system';

import { installChatSession } from '@/features/chat/actions';
import { resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore, type Session } from '@/features/first-run/store';
import { useHomeModeStore } from '@/features/home-mode/store';
import { useAlertsStore } from '@/features/messages/alerts';
import { voice as copy } from '@/features/voice/copy';
import { useVoiceSettings } from '@/features/voice/settings';
import {
  installWakeWord,
  resetWakeRuntime,
  syncWakeWord,
  wakeAllowed,
  wakeConfig,
} from '@/features/voice/wake';
import type { VipContact } from '@/services/api';
import { setMockLatency } from '@/services/api/mock';

jest.mock('expo/fetch', () => ({ fetch: jest.fn() }));
jest.mock('@/features/home-mode/controller', () => ({ checkHomeMode: jest.fn(async () => {}) }));
jest.mock('@/services/geofence', () => ({ isHomeGeofenceRunning: jest.fn(async () => true) }));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

type Wake = {
  running: boolean;
  config: ReturnType<typeof wakeConfig> | null;
  starts: number;
  startResult: boolean;
  held: boolean;
};
const system = AsterSystem as typeof AsterSystem & {
  __state: { wake: Wake };
  __reset(): void;
  __emit(event: string, payload?: unknown): void;
};
const wake = () => system.__state.wake;
const openVoice = jest.fn();

function setAppState(state: 'active' | 'background') {
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
}

const vip = (id: number, enabled = true): VipContact =>
  ({ id, name: `VIP ${id}`, match_key: `vip${id}`, sources: ['whatsapp'], enabled }) as VipContact;

beforeAll(() => {
  setMockLatency(0, 0);
  installChatSession();
});

beforeEach(async () => {
  system.__reset();
  openVoice.mockClear();
  setAppState('active');
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  await resetFirstRun();
  await signIn({ server: 'https://aster.test', email: 'owner@example.test', password: 'pw' });
  await unlockOwner('123456');
  useVoiceSettings.setState({ wakeWord: true });
  useAlertsStore.setState({ vips: [] });
  useHomeModeStore.setState({ mode: { kind: 'ready', busy: false } });
  jest.mocked(AsterSystem.startWakeWord).mockClear();
  resetWakeRuntime();
  installWakeWord(openVoice);
});

const session = () => useFirstRunStore.getState().session!;

describe('when it may listen', () => {
  test('unlocked, voice on, the switch on and at home', () => {
    const facts = { session: session(), mode: { kind: 'ready', busy: false } as const, wakeWord: true };
    expect(wakeAllowed(facts)).toBe(true);
    expect(wakeAllowed({ ...facts, wakeWord: false })).toBe(false);
    expect(wakeAllowed({ ...facts, mode: { kind: 'away', distanceM: 900 } })).toBe(false);
    expect(wakeAllowed({ ...facts, now: Date.parse(session().expiresAt) + 1 })).toBe(false);
    const off: Session = { ...session(), profile: { ...session().profile, voice_enabled: false } };
    expect(wakeAllowed({ ...facts, session: off })).toBe(false);
    const guest: Session = { ...session(), profile: { ...session().profile, role: 'guest' } };
    expect(wakeAllowed({ ...facts, session: guest })).toBe(false);
    expect(wakeAllowed({ ...facts, session: null })).toBe(false);
  });

  test('the notification counts the Owner’s enabled VIPs; the service learns when the session ends', () => {
    const config = wakeConfig(session(), [vip(1), vip(2), vip(3, false)]);
    expect(config.copy.title).toBe('At home · listening for 2 VIPs');
    expect(config.copy.body).toBe(copy.wake.body);
    expect(config.lockAt).toBe(Date.parse(session().expiresAt));
    expect(wakeConfig(session(), []).copy.title).toBe(copy.wake.listening);
    const member: Session = { ...session(), profile: { ...session().profile, role: 'member' } };
    expect(wakeConfig(member, [vip(1)]).copy.title).toBe(copy.wake.listening);
  });
});

describe('the controller', () => {
  test('starts at home with Aster in front, and only once for the same rules', () => {
    expect(wake().running).toBe(true);
    expect(wake().starts).toBe(1);
    syncWakeWord();
    expect(AsterSystem.startWakeWord).toHaveBeenCalledTimes(1);

    // New VIPs: the running service gets new words.
    act(() => useAlertsStore.setState({ vips: [vip(1)] }));
    expect(AsterSystem.startWakeWord).toHaveBeenCalledTimes(2);
    expect(wake().config!.copy.title).toBe('At home · listening for 1 VIP');
    expect(wake().starts).toBe(1);
  });

  test('stops on leaving home, the switch, locking and sign-out', () => {
    act(() => useHomeModeStore.setState({ mode: { kind: 'away', distanceM: 900 } }));
    expect(wake().running).toBe(false);
    act(() => useHomeModeStore.setState({ mode: { kind: 'ready', busy: false } }));
    expect(wake().running).toBe(true);

    act(() => useVoiceSettings.setState({ wakeWord: false }));
    expect(wake().running).toBe(false);
    act(() => useVoiceSettings.setState({ wakeWord: true }));
    expect(wake().running).toBe(true);

    act(() => useFirstRunStore.getState().set({ session: null }));
    expect(wake().running).toBe(false);
  });

  test('waits for Aster to come to the front before starting (Android 14+)', () => {
    act(() => useHomeModeStore.setState({ mode: { kind: 'away', distanceM: 900 } }));
    setAppState('background');
    act(() => useHomeModeStore.setState({ mode: { kind: 'ready', busy: false } }));
    expect(wake().running).toBe(false);

    // Back in front (the AppState listener calls this).
    setAppState('active');
    syncWakeWord();
    expect(wake().running).toBe(true);
  });

  test('a refused start is tried again later', () => {
    act(() => useHomeModeStore.setState({ mode: { kind: 'away', distanceM: 900 } }));
    wake().startResult = false;
    act(() => useHomeModeStore.setState({ mode: { kind: 'ready', busy: false } }));
    expect(wake().running).toBe(false);
    wake().startResult = true;
    syncWakeWord();
    expect(wake().running).toBe(true);
  });

  test('"Hey Aster" with Aster in front opens 3.6, only while unlocked', () => {
    act(() => system.__emit('onWakeWord'));
    expect(openVoice).toHaveBeenCalledTimes(1);
    act(() => useFirstRunStore.getState().set({ session: null }));
    act(() => system.__emit('onWakeWord'));
    expect(openVoice).toHaveBeenCalledTimes(1);
  });
});
