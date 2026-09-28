// 4.3 Spoken alerts, the VIP editor, 5.1's Owner rows and 4.4's home notices
// (docs/aster-messages-alerts-plan.md §3, M5). Against the mock server; the native module and
// expo-notifications are the Jest mocks.
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';

import AsterSystem, { type CapturedThread } from '../modules/aster-system';

import Settings from '@/app/(tabs)/settings';
import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { readDeviceUploads, resetDeviceUploadsRuntime } from '@/features/location/uploads';
import { refreshAlerts, resetAlertsRuntime, useAlertsStore } from '@/features/messages/alerts';
import { AlertsScreen } from '@/features/messages/AlertsScreen';
import { alerts as copy, notifications as noticeCopy, vipEditor } from '@/features/messages/copy';
import {
  handleNoticeResponse,
  offerHomeNotices,
  SERVER_ID,
  WELCOME_ID,
} from '@/features/messages/notify';
import { refreshThreads, resetThreadsRuntime } from '@/features/messages/threads';
import { VipEditor } from '@/features/messages/VipEditor';
import { settings as settingsCopy } from '@/features/settings/copy';
import { api, ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';
import { checkLlmHealth } from '@/services/llm/health';
import { resetNotificationSetup } from '@/services/notifications';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: () => mockBack(),
    canGoBack: () => true,
    replace: jest.fn(),
    navigate: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/services/llm/health', () => ({
  checkLlmHealth: jest.fn(),
  LOCAL_MODEL_ID: 'zephyr-7b',
}));

type MockSystem = typeof AsterSystem & {
  __state: { threads: CapturedThread[] };
  __reset(): void;
};
type MockNotifications = typeof Notifications & {
  __presented: Map<string, { identifier: string; content: { title: string; body: string } }>;
  __reset(): void;
};
const system = AsterSystem as MockSystem;
const notifications = Notifications as MockNotifications;
const health = jest.mocked(checkLlmHealth);
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
const settings = () => useAlertsStore.getState().settings;

const ashaThread: CapturedThread = {
  key: 'whatsapp-aaaaaaaaaaaaaaaaaaaa',
  source: 'whatsapp',
  title: 'Asha Kulkarni',
  isGroup: false,
  count: 2,
  unreadSenders: ['Asha Kulkarni', 'Asha Kulkarni'],
  spokenAt: null,
  canReply: true,
  last: {
    id: 2,
    threadKey: 'whatsapp-aaaaaaaaaaaaaaaaaaaa',
    source: 'whatsapp',
    sender: 'Asha Kulkarni',
    text: 'Are you coming on Sunday?',
    at: Date.parse('2026-09-28T14:12:00Z'),
    outgoing: false,
    otp: false,
    read: false,
    spokenAt: null,
  },
};

async function addVip(name = 'Asha', matchKey = 'Asha Kulkarni') {
  const { session } = useFirstRunStore.getState();
  const vip = await mockApi.createVipContact(server, session!.profileToken, {
    name,
    match_key: matchKey,
    sources: ['whatsapp'],
    enabled: true,
  });
  await refreshAlerts();
  return vip;
}

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  mockPush.mockClear();
  mockBack.mockClear();
  health.mockReset();
  system.__reset();
  notifications.__reset();
  resetNotificationSetup();
  resetThreadsRuntime();
  resetAlertsRuntime();
  resetDeviceUploadsRuntime();
  await resetFirstRun();
  await AsyncStorage.clear();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
  await unlockOwner('123456');
  useFirstRunStore.getState().set({ home });
  finishFirstRun([]);
});

afterEach(() => jest.restoreAllMocks());

describe('4.3 Spoken alerts', () => {
  test('each switch and choice saves to Laravel', async () => {
    await addVip();
    await render(<AlertsScreen />);
    expect(screen.getByText('Asha')).toBeTruthy();
    expect(screen.getByText('WhatsApp')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText(copy.minutes(5)));
    expect(settings().missed_after_minutes).toBe(5);
    await fireEvent.press(screen.getByLabelText('Name only'));
    expect(settings().speak_mode).toBe('name');
    expect(screen.getByText('“You missed 2 WhatsApp messages from Asha.”')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(copy.urgent));
    expect(settings().urgent_keywords).toEqual(['urgent', 'call me']);
    await fireEvent.press(screen.getByLabelText(copy.atHome));
    expect(settings().only_at_home).toBe(true);

    const { session } = useFirstRunStore.getState();
    expect(await mockApi.getAlertSettings(server, session!.profileToken)).toMatchObject({
      missed_after_minutes: 5,
      speak_mode: 'name',
      only_at_home: true,
    });
  });

  test('quiet hours start at 11 PM to 7 AM and each end opens the time dialog', async () => {
    await render(<AlertsScreen />);
    await fireEvent.press(screen.getByLabelText(copy.quietHours));
    expect(settings()).toMatchObject({ quiet_start: '23:00', quiet_end: '07:00' });
    expect(screen.getByText('11:00 PM to 7:00 AM')).toBeTruthy();

    const open = jest.mocked(DateTimePickerAndroid.open);
    await fireEvent.press(screen.getByLabelText(`${copy.to} 7:00 AM`));
    const { onChange } = open.mock.calls[0][0];
    const picked = new Date();
    picked.setHours(6, 30, 0, 0);
    await onChange!(
      { type: 'set', nativeEvent: { timestamp: picked.getTime(), utcOffset: 0 } },
      picked,
    );
    await waitFor(() => expect(settings().quiet_end).toBe('06:30'));
  });

  test('a refused change is put back and says so', async () => {
    jest.spyOn(api, 'putAlertSettings').mockRejectedValueOnce(new ApiError(0, 'offline'));
    await render(<AlertsScreen />);
    await fireEvent.press(screen.getByLabelText(copy.headphones));
    expect(settings().headphones_only).toBe(false);
    expect(screen.getByText(copy.saveFailed)).toBeTruthy();
  });

  test('a VIP’s switch turns it off; Add opens the editor', async () => {
    await addVip();
    await render(<AlertsScreen />);
    await fireEvent.press(screen.getByRole('switch', { name: 'Asha' }));
    expect(useAlertsStore.getState().vips[0].enabled).toBe(false);
    await fireEvent.press(screen.getByText(copy.addVip));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/vip/[id]', params: { id: 'new' } });
  });
});

describe('VIP editor', () => {
  test('recent senders fill the fields; Save adds the VIP', async () => {
    system.__state.threads = [ashaThread];
    await refreshThreads();
    await render(<VipEditor id={null} />);
    await fireEvent.press(screen.getByLabelText('Asha Kulkarni · WhatsApp'));
    await fireEvent.changeText(screen.getByLabelText(vipEditor.name), 'Asha');
    await fireEvent.press(screen.getByLabelText(vipEditor.save));
    expect(useAlertsStore.getState().vips).toMatchObject([
      { name: 'Asha', match_key: 'Asha Kulkarni', sources: ['whatsapp'] },
    ]);
    expect(mockBack).toHaveBeenCalled();
  });

  test('missing fields are named before anything is sent', async () => {
    const create = jest.spyOn(api, 'createVipContact');
    await render(<VipEditor id={null} />);
    await fireEvent.press(screen.getByLabelText(vipEditor.save));
    expect(screen.getByText(vipEditor.nameRequired)).toBeTruthy();
    expect(screen.getByText(vipEditor.matchKeyRequired)).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  test('editing changes the apps', async () => {
    const vip = await addVip();
    await render(<VipEditor id={vip.id} />);
    await fireEvent.press(screen.getByLabelText('SMS'));
    await fireEvent.press(screen.getByLabelText(vipEditor.save));
    expect(useAlertsStore.getState().vips[0].sources).toEqual(['whatsapp', 'sms']);
  });
});

describe('5.1 for the Owner', () => {
  test('Spoken alerts and battery rows, and the lock-screen switch', async () => {
    await addVip();
    await render(<Settings />);
    expect(screen.getByText(settingsCopy.spokenDetail(1, 10))).toBeTruthy();
    expect(screen.getByText(settingsCopy.optimized)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(settingsCopy.background));
    expect(AsterSystem.requestIgnoreBatteryOptimizations).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText(settingsCopy.hideText));
    expect(useAlertsStore.getState().hideOnLockScreen).toBe(false);
    await fireEvent.press(screen.getByLabelText(settingsCopy.spokenAlerts));
    expect(mockPush).toHaveBeenCalledWith('/alerts');
  });
});

describe('4.4 home notices', () => {
  test('arriving with the model ready and VIPs waiting: Welcome home', async () => {
    await addVip();
    system.__state.threads = [ashaThread];
    health.mockResolvedValue({ kind: 'ready', model: 'zephyr-7b', ms: 20 });
    expect(await offerHomeNotices()).toBe('welcome');
    expect(notifications.__presented.get(WELCOME_ID)?.content).toMatchObject({
      title: noticeCopy.welcomeTitle,
      body: 'zephyr-7b is ready. You missed 2 messages from Asha.',
    });
  });

  test('no VIP messages: nothing to offer', async () => {
    health.mockResolvedValue({ kind: 'ready', model: 'zephyr-7b', ms: 20 });
    expect(await offerHomeNotices()).toBeNull();
    expect(notifications.__presented.size).toBe(0);
  });

  test('no reply: the server notice and one server_problem event, also after Retry', async () => {
    jest.spyOn(api, 'postActivity').mockRejectedValue(new ApiError(0, 'offline'));
    health.mockResolvedValue({ kind: 'no-reply' });
    expect(await offerHomeNotices()).toBe('server');
    expect(notifications.__presented.get(SERVER_ID)?.content.body).toBe(
      'You’re home, but 192.168.1.20 isn’t replying. Alerts still read messages out.',
    );
    const response = (actionIdentifier: string, notice: string) => ({
      actionIdentifier,
      notification: { request: { content: { data: { notice } } } },
    });
    expect(await handleNoticeResponse(response('retry', 'server'))).toBeNull();
    expect((await readDeviceUploads()).events.map((e) => e.type)).toEqual(['server_problem']);
    expect(await handleNoticeResponse(response('open-settings', 'server'))).toBe('/settings');
    expect(await handleNoticeResponse(response('catch-up', 'welcome'))).toBe('/messages');
    expect(await handleNoticeResponse(response('later', 'welcome'))).toBeNull();
  });
});
