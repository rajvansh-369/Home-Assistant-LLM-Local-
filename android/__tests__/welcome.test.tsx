import { fireEvent, render, screen } from '@testing-library/react-native';

import Welcome from '@/app/(first-run)/welcome';
import { common, welcome } from '@/features/first-run/copy';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

beforeEach(() => mockPush.mockClear());

test('shows the §4.1 copy, with the brand and headline as headers', async () => {
  await render(<Welcome />);
  expect(screen.getByRole('header', { name: common.brand })).toBeTruthy();
  expect(screen.getByRole('header', { name: welcome.headline })).toBeTruthy();
  for (const text of Object.values(welcome.features)) expect(screen.getByText(text)).toBeTruthy();
  expect(screen.getByText(welcome.caption)).toBeTruthy();
});

test('has no back button (Welcome is the root)', async () => {
  await render(<Welcome />);
  expect(screen.queryByRole('button', { name: common.back })).toBeNull();
});

test('Set up Aster goes to Sign in', async () => {
  await render(<Welcome />);
  await fireEvent.press(screen.getByRole('button', { name: welcome.cta }));
  expect(mockPush).toHaveBeenCalledWith('/sign-in');
});
