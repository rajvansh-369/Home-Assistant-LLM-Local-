import { fireEvent, render, screen } from '@testing-library/react-native';

import Chats from '@/app/(tabs)/chats';
import { addMessages, createChat, installChatSession, newMessage } from '@/features/chat/actions';
import { chats as copy } from '@/features/chat/copy';
import { resetQueueRunner } from '@/features/chat/queue';
import { resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { setMockLatency } from '@/services/api/mock';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args), back: jest.fn() },
  useFocusEffect: jest.fn(),
}));

beforeAll(() => {
  setMockLatency(0, 0);
  installChatSession();
});

beforeEach(async () => {
  mockPush.mockClear();
  resetQueueRunner();
  await resetFirstRun();
  await signIn({ server: 'https://aster.test', email: 'owner@example.test', password: 'pw' });
  await unlockOwner('123456');
});

test('empty: the privacy line, the private-chat card and a hint', async () => {
  await render(<Chats />);
  expect(screen.getByRole('header', { name: copy.title })).toBeTruthy();
  expect(screen.getByText(copy.privacy('Test Owner'))).toBeTruthy();
  expect(screen.getByText(copy.empty)).toBeTruthy();

  await fireEvent.press(
    screen.getByRole('button', { name: `${copy.privateTitle}, ${copy.privateNote}` }),
  );
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'private' } });
});

test('lists chats under Today with the answer as preview, and opens one', async () => {
  const chat = createChat('Goa trip budget');
  addMessages(chat, [
    newMessage('user', 'Goa trip budget'),
    newMessage('assistant', 'Here is a 4-day plan.'),
  ]);
  await render(<Chats />);

  expect(screen.getByRole('header', { name: copy.groups.today })).toBeTruthy();
  const row = screen.getByRole('button', { name: /^Goa trip budget, .*Here is a 4-day plan\./ });
  await fireEvent.press(row);
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: chat } });
});

test('search filters by title', async () => {
  createChat('Goa trip budget');
  createChat('Paneer dinners');
  await render(<Chats />);

  await fireEvent.press(screen.getByRole('button', { name: copy.search }));
  await fireEvent.changeText(screen.getByLabelText(copy.search), 'panEER');

  expect(screen.queryByRole('button', { name: /^Goa trip budget/ })).toBeNull();
  expect(screen.getByRole('button', { name: /^Paneer dinners/ })).toBeTruthy();

  await fireEvent.changeText(screen.getByLabelText(copy.search), 'zzz');
  expect(screen.getByText(copy.noMatch('zzz'))).toBeTruthy();
});
