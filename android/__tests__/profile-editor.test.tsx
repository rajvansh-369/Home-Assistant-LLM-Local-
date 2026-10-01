// 2.4 Edit profile and chat without an llm_token (docs/aster-profiles-memory-plan.md P3). Against
// the mock server, which answers profiles as Laravel does.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { askZypher } from '@/features/chat/ask';
import { errorText } from '@/features/chat/useChat';
import { chat as chatCopy } from '@/features/chat/copy';
import { finishFirstRun, resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore } from '@/features/first-run/store';
import { loadProfiles, unlockProfile } from '@/features/profiles/actions';
import { profileEditor as copy } from '@/features/profiles/copy';
import { useManageStore } from '@/features/profiles/manage';
import { ProfileEditor } from '@/features/profiles/ProfileEditor';
import { useProfilesStore } from '@/features/profiles/store';
import { api, ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';
import { ChatError } from '@/services/llm/chat';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: () => mockBack(),
    canGoBack: () => true,
    replace: jest.fn(),
  },
}));

const server = 'https://aster.test';
const wait = { timeout: 3000 };
const ownerToken = () => useFirstRunStore.getState().session!.profileToken;
const memberId = () => useProfilesStore.getState().profiles.find((p) => p.role === 'member')!.id;

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  mockBack.mockClear();
  useManageStore.getState().set({ details: {}, detailsSupported: true });
  await resetFirstRun();
  await signIn({ server, email: 'family@example.test', password: 'pw' });
  await unlockOwner('123456');
  finishFirstRun([]);
  await loadProfiles();
});

afterEach(() => jest.restoreAllMocks());

test('adding a Restricted profile with a PIN; it shows up and unlocks', async () => {
  await render(<ProfileEditor id={null} />);
  expect(screen.getByText(copy.newTitle)).toBeTruthy();

  await fireEvent.press(screen.getByLabelText(copy.create));
  expect(screen.getByText(copy.nameRequired)).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText(copy.name), 'Kiran');
  await fireEvent.changeText(screen.getByLabelText(copy.pin), '13a5790');
  await fireEvent.press(screen.getByLabelText('Restricted'));
  await fireEvent.press(screen.getByLabelText('Precise'));
  await fireEvent.press(screen.getByLabelText(copy.history));
  await fireEvent.press(screen.getByLabelText(copy.create));

  await waitFor(() => expect(mockBack).toHaveBeenCalled(), wait);
  const kiran = useProfilesStore.getState().profiles.find((p) => p.name === 'Kiran')!;
  expect(kiran.role).toBe('restricted');
  expect(await mockApi.getProfile(server, ownerToken(), kiran.id)).toMatchObject({
    sampling: 'precise',
    history_enabled: false,
  });
  await unlockProfile(kiran.id, '135790');
  expect(useFirstRunStore.getState().session?.profile.name).toBe('Kiran');
});

test('editing saves each change at once; a PIN change works at the next unlock', async () => {
  const id = memberId();
  await render(<ProfileEditor id={id} />);
  await waitFor(() => expect(screen.getByText(copy.title)).toBeTruthy(), wait);
  await waitFor(() => expect(screen.getByLabelText(copy.chat)).toBeTruthy(), wait);

  await fireEvent.press(screen.getByLabelText('Restricted'));
  await waitFor(
    () => expect(useManageStore.getState().details[id].role).toBe('restricted'),
    wait,
  );
  expect(screen.getByText(copy.webRestricted)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Off'));
  await waitFor(
    () => expect(useManageStore.getState().details[id].auto_lock_minutes).toBeNull(),
    wait,
  );

  await fireEvent.changeText(screen.getByLabelText(copy.pin), '999999');
  await fireEvent.press(screen.getByLabelText(copy.pinChange));
  await waitFor(() => expect(screen.getByText(copy.pinSaved)).toBeTruthy(), wait);
  await unlockProfile(id, '999999');
});

test('a refused change is put back with a note', async () => {
  await render(<ProfileEditor id={memberId()} />);
  await waitFor(() => expect(screen.getByLabelText(copy.chat)).toBeTruthy(), wait);
  jest.spyOn(api, 'updateProfile').mockRejectedValueOnce(new ApiError(0, 'Network request failed'));

  await fireEvent.press(screen.getByLabelText('Creative'));
  await waitFor(() => expect(screen.getByText(copy.saveFailed)).toBeTruthy(), wait);
  expect(useManageStore.getState().details[memberId()].sampling).toBe('auto');
});

test('deleting asks first, then removes the profile', async () => {
  const id = memberId();
  const alert = jest.spyOn(Alert, 'alert');
  await render(<ProfileEditor id={id} />);
  await waitFor(() => expect(screen.getByLabelText(copy.chat)).toBeTruthy(), wait);

  await fireEvent.press(screen.getByLabelText(copy.delete('Test Member')));
  const buttons = alert.mock.calls[0][2]!;
  await act(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());

  await waitFor(() => expect(mockBack).toHaveBeenCalled(), wait);
  expect(useProfilesStore.getState().profiles.some((p) => p.id === id)).toBe(false);
});

test('an older Laravel without GET /profiles/{id} says the server needs an update', async () => {
  jest.spyOn(api, 'getProfile').mockRejectedValue(new ApiError(405, 'Method not allowed.'));
  await render(<ProfileEditor id={memberId()} />);
  await waitFor(() => expect(screen.getByText(copy.oldServer)).toBeTruthy(), wait);
});

test('chat off: unlock brings no llm_token and a chat says why', async () => {
  await mockApi.updateProfile(server, ownerToken(), memberId(), { chat_enabled: false });
  jest.spyOn(api, 'unlockProfile').mockImplementationOnce(async (...args) => ({
    ...(await mockApi.unlockProfile(...args)),
    llm_token: null,
  }));
  await unlockProfile(memberId(), '222222');
  expect(useFirstRunStore.getState().session?.llmToken).toBeNull();
  useFirstRunStore.getState().set({
    home: {
      address: 'Maple Court',
      lat: 0,
      lng: 0,
      radius_m: 150,
      wifi_ssid: null,
      llm_url: 'http://192.168.1.20:8000',
    },
  });

  const error = await askZypher({ messages: [], web: false, onEvent: () => {} }).catch(
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ChatError);
  expect(errorText(error, 'Local')).toBe(chatCopy.errors.chatOff);
});
