// Messages (docs/aster-messages-alerts-plan.md M1–M2): the captured threads from the native store,
// VIP matching, the alert settings handed to the native engine, its activity events, and
// clearing on sign-out. Against the mock server; the native module is the Jest mock.
import AsyncStorage from '@react-native-async-storage/async-storage';

import AsterSystem, { type CapturedThread } from '../modules/aster-system';

import { resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { readDeviceUploads, resetDeviceUploadsRuntime } from '@/features/location/uploads';
import {
  refreshAlerts,
  resetAlertsRuntime,
  saveAlertSettings,
  setHideOnLockScreen,
  setVipEnabled,
  useAlertsStore,
} from '@/features/messages/alerts';
import { drainActivity, forgetMessages, syncLlmAccess } from '@/features/messages/install';
import {
  clearThreads,
  installThreads,
  markThreadRead,
  refreshThreads,
  resetThreadsRuntime,
  unreadCount,
  useThreadsStore,
} from '@/features/messages/threads';
import { normalizeName, threadVip, unreadVipCount, vipFor } from '@/features/messages/vip';
import { lockSession } from '@/features/profiles/actions';
import { api, ApiError, type VipContact } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';

type MockSystem = typeof AsterSystem & {
  __state: {
    threads: CapturedThread[];
    seen: string[];
    config: string | null;
    llmAccess: { url: string; expiresAt: number } | null;
    activity: unknown[];
  };
  __reset(): void;
  __emit(event: string): void;
};
const system = AsterSystem as MockSystem;

function thread(overrides: Partial<CapturedThread> = {}): CapturedThread {
  const key = overrides.key ?? 'whatsapp-0123456789abcdef0123';
  return {
    key,
    source: 'whatsapp',
    title: 'Asha Kulkarni',
    isGroup: false,
    count: 2,
    unreadSenders: ['Asha Kulkarni', 'Asha Kulkarni'],
    spokenAt: null,
    canReply: true,
    last: {
      id: 2,
      threadKey: key,
      source: overrides.source ?? 'whatsapp',
      sender: 'Asha Kulkarni',
      text: 'Are you coming on Sunday?',
      at: Date.parse('2026-09-28T14:12:00Z'),
      outgoing: false,
      otp: false,
      read: false,
      spokenAt: null,
    },
    ...overrides,
  };
}

const server = 'https://aster.test';
const home = {
  id: 41,
  address: 'Maple Court',
  lat: 18.52,
  lng: 73.85,
  radius_m: 150,
  wifi_ssid: null,
  llm_url: 'http://192.168.1.20:8000',
};

const vip = (overrides: Partial<VipContact> = {}): VipContact => ({
  id: 1,
  name: 'Asha',
  match_key: 'Asha Kulkarni',
  sources: ['whatsapp', 'sms'],
  enabled: true,
  ...overrides,
});

beforeAll(() => setMockLatency(0, 0));

beforeEach(() => {
  system.__reset();
  resetThreadsRuntime();
});

test('refresh reads the threads and whether notification access is on', async () => {
  system.__state.threads = [thread()];
  jest.mocked(AsterSystem.isNotificationListenerEnabled).mockReturnValueOnce(true);
  await refreshThreads();
  const state = useThreadsStore.getState();
  expect(state.loaded).toBe(true);
  expect(state.listening).toBe(true);
  expect(state.threads.map(unreadCount)).toEqual([2]);
});

test('a native change event refreshes the list', async () => {
  installThreads();
  await refreshThreads();
  expect(useThreadsStore.getState().threads).toEqual([]);
  system.__state.threads = [thread()];
  system.__emit('onMessagesChanged');
  await refreshThreads();
  expect(useThreadsStore.getState().threads).toHaveLength(1);
});

test('reading a thread clears its unread count at once and on the native side', async () => {
  system.__state.threads = [thread()];
  await refreshThreads();
  await markThreadRead('whatsapp-0123456789abcdef0123');
  expect(unreadCount(useThreadsStore.getState().threads[0])).toBe(0);
  expect(system.__state.seen).toEqual(['whatsapp-0123456789abcdef0123']);
});

test('clearing forgets every thread', async () => {
  system.__state.threads = [thread()];
  await refreshThreads();
  await clearThreads();
  expect(useThreadsStore.getState().threads).toEqual([]);
  expect(AsterSystem.clearMessages).toHaveBeenCalled();
});

describe('VIP matching (same rules as the native engine)', () => {
  test('names are compared after NFKC, lower case and collapsed spaces', () => {
    expect(normalizeName('  ASHA  Kulkarni ')).toBe('asha kulkarni');
    expect(normalizeName('ＡＳＨＡ')).toBe('asha');
  });

  test('a sender or a one-to-one title matches on the VIP’s apps only', () => {
    const vips = [vip()];
    expect(vipFor(vips, 'whatsapp', 'asha kulkarni', 'x', false)?.id).toBe(1);
    expect(vipFor(vips, 'sms', '+91 98', 'Asha Kulkarni', false)?.id).toBe(1);
    expect(vipFor(vips, 'google_chat', 'Asha Kulkarni', 'Asha Kulkarni', false)).toBeNull();
    expect(vipFor(vips, 'whatsapp', 'Ravi', 'Asha Kulkarni', true)).toBeNull();
    expect(vipFor([vip({ enabled: false })], 'whatsapp', 'Asha Kulkarni', 'x', false)).toBeNull();
  });

  test('a group counts only its VIPs’ unread messages', () => {
    const group = thread({
      isGroup: true,
      title: 'Family',
      unreadSenders: ['Ravi', 'Asha Kulkarni', 'Asha Kulkarni'],
    });
    expect(unreadVipCount(group, [vip()])).toBe(2);
    expect(threadVip(group, [vip()])?.name).toBe('Asha');
    expect(unreadVipCount(thread(), [])).toBe(0);
  });
});

describe('alert settings on the phone', () => {
  const config = () => JSON.parse(system.__state.config ?? '{}');

  beforeEach(async () => {
    resetAlertsRuntime();
    resetDeviceUploadsRuntime();
    await resetFirstRun();
    await AsyncStorage.clear();
    await signIn({ server, email: 'family@example.test', password: 'pw' });
    await unlockOwner('123456');
    useFirstRunStore.getState().set({ home });
  });

  afterEach(() => jest.restoreAllMocks());

  test('the Owner’s refresh caches Laravel’s rules and hands them to native', async () => {
    const { session } = useFirstRunStore.getState();
    await mockApi.createVipContact(server, session!.profileToken, {
      name: 'Asha',
      match_key: 'Asha Kulkarni',
      sources: ['whatsapp'],
      enabled: true,
    });
    await mockApi.putAlertSettings(server, session!.profileToken, { missed_after_minutes: 5 });
    expect(await refreshAlerts()).toBe(true);
    expect(useAlertsStore.getState().vips.map((v) => v.name)).toEqual(['Asha']);
    expect(config()).toMatchObject({
      settings: { missed_after_minutes: 5, speak_mode: 'full' },
      vips: [{ match_key: 'Asha Kulkarni', sources: ['whatsapp'] }],
      hide_on_lock_screen: true,
      copy: { title: '{name} · {count} missed {source} {messages}' },
    });
    expect(JSON.parse((await AsyncStorage.getItem('aster.alert-settings'))!).vips).toHaveLength(1);
  });

  test('a change shows at once and is put back when Laravel refuses', async () => {
    expect(await saveAlertSettings({ speak_mode: 'name' })).toBe(true);
    expect(config().settings.speak_mode).toBe('name');

    jest.spyOn(api, 'putAlertSettings').mockRejectedValueOnce(new ApiError(0, 'offline'));
    expect(await saveAlertSettings({ only_at_home: true })).toBe(false);
    expect(useAlertsStore.getState().settings.only_at_home).toBe(false);
    expect(config().settings.only_at_home).toBe(false);
  });

  test('a VIP’s switch and the lock-screen choice reach native', async () => {
    const { session } = useFirstRunStore.getState();
    const created = await mockApi.createVipContact(server, session!.profileToken, {
      name: 'Asha',
      match_key: 'Asha Kulkarni',
      sources: ['sms'],
      enabled: true,
    });
    await refreshAlerts();
    expect(await setVipEnabled(created.id, false)).toBe(true);
    expect(config().vips[0].enabled).toBe(false);
    await setHideOnLockScreen(false);
    expect(config().hide_on_lock_screen).toBe(false);
  });

  test('only the Owner reads or changes them', async () => {
    lockSession();
    expect(await refreshAlerts()).toBe(false);
    expect(await saveAlertSettings({ enabled: false })).toBe(false);
  });

  test('native gets the Owner’s llm_token while unlocked, and loses it on lock', () => {
    syncLlmAccess();
    expect(system.__state.llmAccess?.url).toBe(home.llm_url);
    lockSession();
    syncLlmAccess();
    expect(system.__state.llmAccess).toBeNull();
  });

  test('native activity events go to the device queue', async () => {
    jest.spyOn(api, 'postActivity').mockRejectedValue(new ApiError(0, 'offline'));
    system.__state.activity = [
      {
        client_uuid: '9dc0a03c-0bc9-4fbd-9cde-0be3c08a9c99',
        type: 'spoken_alert',
        summary: 'Read out 2 WhatsApp messages from Asha',
        meta: { source: 'whatsapp', count: 2, mode: 'full' },
        occurred_at: '2026-09-28T10:00:00Z',
      },
    ];
    expect(await drainActivity()).toBe(1);
    expect((await readDeviceUploads()).events.map((e) => e.type)).toEqual(['spoken_alert']);
    expect(await drainActivity()).toBe(0);
  });

  test('signing out clears messages and rules', async () => {
    system.__state.threads = [thread()];
    await refreshThreads();
    await saveAlertSettings({ speak_mode: 'summary' });
    await forgetMessages();
    expect(useThreadsStore.getState().threads).toEqual([]);
    expect(useAlertsStore.getState().settings.speak_mode).toBe('full');
    expect(config().vips).toEqual([]);
  });
});
