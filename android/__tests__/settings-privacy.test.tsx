// 5.1 Privacy's Auto-lock and Your data (docs/aster-profiles-memory-plan.md P5). Against the mock
// server, which answers DELETE /conversations as Laravel does.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import Settings from '@/app/(tabs)/settings';
import { createChat } from '@/features/chat/actions';
import { loadChats, useChatStore } from '@/features/chat/store';
import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { settings as copy } from '@/features/settings/copy';
import { api, ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

const server = 'https://aster.test';
const wait = { timeout: 3000 };
const token = () => useFirstRunStore.getState().session!.profileToken;

async function choose(label: string) {
  const alert = jest.mocked(Alert.alert);
  const buttons = alert.mock.calls.at(-1)![2] as AlertButton[];
  await act(async () => buttons.find((b) => b.text === label)!.onPress!());
}

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await resetFirstRun();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
  await unlockOwner('123456');
  finishFirstRun([]);
});

afterEach(() => jest.restoreAllMocks());

test('Auto-lock shows the profile’s choice and changes it on Laravel', async () => {
  await render(<Settings />);
  // The seeded Owner locks after 2 minutes.
  await fireEvent.press(screen.getByRole('button', { name: copy.autoLock }));
  await choose(copy.autoLockOff);

  await waitFor(
    () => expect(useFirstRunStore.getState().session?.profile.auto_lock_minutes).toBeNull(),
    wait,
  );
  expect(useFirstRunStore.getState().lockWhenLeave).toBe(false);
  expect((await mockApi.getMe(server, token())).auto_lock_minutes).toBeNull();
  expect(screen.getByRole('button', { name: copy.autoLock }).props.accessibilityHint).toBe(
    copy.autoLockOff,
  );

  await fireEvent.press(screen.getByRole('button', { name: copy.autoLock }));
  await choose(copy.autoLockOn);
  await waitFor(
    () => expect(useFirstRunStore.getState().session?.profile.auto_lock_minutes).toBe(2),
    wait,
  );
});

test('Delete all of my chats empties Laravel and this phone', async () => {
  const profileId = useFirstRunStore.getState().session!.profile.id;
  await loadChats(profileId);
  await mockApi.createConversation(server, token(), { client_uuid: 'c-1', title: 'Old chat' });
  createChat('A chat only on this phone');
  await render(<Settings />);

  const label = copy.deleteChats('Test Owner');
  await fireEvent.press(screen.getByRole('button', { name: label }));
  await choose(label);

  await waitFor(() => expect(screen.getByText(copy.deleteChatsDone)).toBeTruthy(), wait);
  expect(useChatStore.getState().chats).toEqual({});
  expect(useChatStore.getState().queue).toEqual([]);
  expect((await mockApi.listConversations(server, token())).data).toEqual([]);
});

test('an older Laravel says the server needs an update; nothing is deleted here', async () => {
  const profileId = useFirstRunStore.getState().session!.profile.id;
  await loadChats(profileId);
  createChat('Keep me');
  jest.spyOn(api, 'deleteAllConversations').mockRejectedValueOnce(new ApiError(405, 'Nope.'));
  await render(<Settings />);

  const label = copy.deleteChats('Test Owner');
  await fireEvent.press(screen.getByRole('button', { name: label }));
  await choose(label);

  await waitFor(() => expect(screen.getByText(copy.deleteChatsOld)).toBeTruthy(), wait);
  expect(Object.keys(useChatStore.getState().chats)).toHaveLength(1);
});
