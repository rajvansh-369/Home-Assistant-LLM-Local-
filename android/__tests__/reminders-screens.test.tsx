// "Coming up" on 3.1 / 3.2 and the reminder editor (docs/aster-reminders-location-plan.md §3, R3).
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

import Home from '@/app/(tabs)/home';
import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { useHomeModeStore } from '@/features/home-mode/store';
import { lockSession, loadProfiles, unlockProfile } from '@/features/profiles/actions';
import { addReminder } from '@/features/reminders/actions';
import { resetAlarmsRuntime } from '@/features/reminders/alarms';
import { reminders as copy } from '@/features/reminders/copy';
import { resetReminderQueueRunner } from '@/features/reminders/queue';
import { ReminderEditor } from '@/features/reminders/ReminderEditor';
import { resetRemindersRuntime, useRemindersStore } from '@/features/reminders/store';
import { resetDeviceUploadsRuntime } from '@/features/location/uploads';
import { setMockLatency } from '@/services/api/mock';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: () => mockBack(),
    canGoBack: () => true,
    navigate: jest.fn(),
    replace: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

jest.mock('@/services/geofence', () => ({ isHomeGeofenceRunning: jest.fn(async () => true) }));
jest.mock('@/tasks/geofence-task', () => ({
  readGeofenceEvents: jest.fn(async () => []),
  onGeofenceEvent: jest.fn(() => () => {}),
}));
jest.mock('@/services/permissions', () => ({
  permissionEntries: [
    {
      key: 'location',
      check: jest.fn(async () => 'allowed'),
      request: jest.fn(async () => 'done'),
    },
  ],
}));

const HOUR = 60 * 60 * 1000;
const reminders = () => Object.values(useRemindersStore.getState().reminders);
const pickerOpen = jest.mocked(DateTimePickerAndroid.open);

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  mockPush.mockClear();
  mockBack.mockClear();
  pickerOpen.mockReset();
  resetRemindersRuntime();
  resetReminderQueueRunner();
  resetAlarmsRuntime();
  resetDeviceUploadsRuntime();
  await resetFirstRun();
  await AsyncStorage.clear();
  await signIn({ server: 'https://aster.test', email: 'family@example.test', password: 'pw' });
  await unlockOwner('123456');
  finishFirstRun([]);
  useHomeModeStore.setState({ mode: { kind: 'ready', busy: false } });
});

describe('Coming up', () => {
  test('lists the pending reminders with their labels; Add and a row open the editor', async () => {
    const uuid = await addReminder(
      { title: 'Call the plumber', trigger: 'time', dueAt: new Date(Date.now() + 26 * HOUR) },
      true,
    );
    await addReminder({ title: 'Water the plants', trigger: 'arrive_home', dueAt: null }, true);
    await render(<Home />);

    expect(screen.getByRole('header', { name: copy.comingUp })).toBeTruthy();
    const row = screen.getByRole('button', { name: /^Call the plumber, / });
    expect(screen.getByText(copy.whenHome)).toBeTruthy();

    await fireEvent.press(row);
    expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/reminder/[id]', params: { id: uuid } });
    await fireEvent.press(screen.getByRole('button', { name: copy.addFirst }));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/reminder/[id]',
      params: { id: 'new' },
    });
  });

  test('three rows, then Show all', async () => {
    for (let i = 1; i <= 4; i++) {
      await addReminder(
        { title: `Task ${i}`, trigger: 'time', dueAt: new Date(Date.now() + i * HOUR) },
        true,
      );
    }
    await render(<Home />);
    expect(screen.queryByText('Task 4')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: copy.showAll(4) }));
    expect(screen.getByText('Task 4')).toBeTruthy();
  });

  test("only the unlocked profile's reminders; nothing for Guest", async () => {
    await addReminder({ title: "Owner's own", trigger: 'arrive_home', dueAt: null }, true);
    lockSession();
    const { profiles } = await loadProfiles();
    await unlockProfile(profiles.find((p) => p.role === 'member')!.id, '222222');
    await render(<Home />);
    expect(screen.queryByText("Owner's own")).toBeNull();
    expect(screen.getByText(copy.nothing)).toBeTruthy();

    useFirstRunStore.getState().set({
      session: {
        ...useFirstRunStore.getState().session!,
        profile: { id: 99, name: 'Guest', color: '#9299A1', role: 'guest' },
      },
    });
    await render(<Home />);
    expect(screen.queryByRole('header', { name: copy.comingUp })).toBeNull();
  });
});

describe('editor', () => {
  test('a new time reminder: needs a title, then saves in an hour and goes back', async () => {
    await render(<ReminderEditor id="new" />);
    await fireEvent.press(screen.getByRole('button', { name: copy.editor.save }));
    expect(screen.getByText(copy.editor.errors.title)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(copy.editor.what), '  Call the plumber ');
    await fireEvent.press(screen.getByRole('button', { name: copy.editor.inHour }));
    await fireEvent.press(screen.getByRole('button', { name: copy.editor.save }));

    const [saved] = reminders();
    expect(saved).toMatchObject({ title: 'Call the plumber', trigger: 'time', status: 'pending' });
    expect(Date.parse(saved.dueAt!) - Date.now()).toBeGreaterThan(55 * 60 * 1000);
    expect(mockBack).toHaveBeenCalled();
  });

  test('a time picked in the past is refused', async () => {
    await render(<ReminderEditor id="new" />);
    await fireEvent.changeText(screen.getByLabelText(copy.editor.what), 'Too late');
    await fireEvent.press(screen.getByRole('button', { name: /^Time, / }));
    const { onChange } = pickerOpen.mock.calls[0][0];
    const past = new Date(Date.now() - 2 * HOUR);
    await act(async () =>
      onChange!({ type: 'set', nativeEvent: { timestamp: past.getTime(), utcOffset: 0 } }, past),
    );
    await fireEvent.press(screen.getByRole('button', { name: copy.editor.save }));
    expect(screen.getByText(copy.editor.errors.past)).toBeTruthy();
    expect(reminders()).toEqual([]);
  });

  test('When I get home saves an arrive-home reminder, waiting for a departure', async () => {
    await render(<ReminderEditor id="new" />);
    await fireEvent.changeText(screen.getByLabelText(copy.editor.what), 'Water the plants');
    await fireEvent.press(screen.getByRole('radio', { name: copy.editor.whenHome }));
    expect(screen.getByText(copy.editor.homeHelp)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: copy.editor.save }));
    expect(reminders()[0]).toMatchObject({ trigger: 'arrive_home', dueAt: null, armed: false });
  });

  test('editing: Mark done and Delete', async () => {
    const first = await addReminder(
      { title: 'First', trigger: 'time', dueAt: new Date(Date.now() + HOUR) },
      true,
    );
    await render(<ReminderEditor id={first} />);
    expect(screen.getByDisplayValue('First')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: copy.editor.markDone }));
    expect(useRemindersStore.getState().reminders[first]?.status ?? 'done').toBe('done');

    const second = await addReminder(
      { title: 'Second', trigger: 'time', dueAt: new Date(Date.now() + HOUR) },
      true,
    );
    const alert = jest.spyOn(Alert, 'alert');
    await render(<ReminderEditor id={second} />);
    await fireEvent.press(screen.getByRole('button', { name: copy.editor.delete }));
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());
    expect(useRemindersStore.getState().reminders[second]).toBeUndefined();
  });

  test("another profile's or a finished reminder shows that it's gone", async () => {
    await render(<ReminderEditor id="0b0c0d0e-0000-4000-8000-000000000000" />);
    expect(await screen.findByText(copy.editor.notFound)).toBeTruthy();
  });
});
