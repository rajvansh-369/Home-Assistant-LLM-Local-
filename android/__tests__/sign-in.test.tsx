import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import SignIn from '@/app/(first-run)/sign-in';
import Welcome from '@/app/(first-run)/welcome';
import { resetFirstRun } from '@/features/first-run/actions';
import { signIn as copy, welcome } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { setMockLatency } from '@/services/api/mock';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: jest.fn(),
    dismissTo: jest.fn(),
  },
  useFocusEffect: jest.fn(),
}));

const wait = { timeout: 3000 };
const reachable = /^Reachable · HTTPS · \d+ ms$/;

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  mockPush.mockClear();
  await resetFirstRun();
});

async function fillIn(server: string, email: string, password: string) {
  await fireEvent.changeText(screen.getByLabelText(copy.serverLabel), server);
  await fireEvent.changeText(screen.getByLabelText(copy.emailLabel), email);
  await fireEvent.changeText(screen.getByLabelText(copy.passwordLabel), password);
}

const submitButton = (label: string = copy.submit) => screen.getByRole('button', { name: label });

test('Welcome shows the copy and goes to Sign in', async () => {
  await render(<Welcome />);
  expect(screen.getByText(welcome.headline)).toBeTruthy();
  for (const text of Object.values(welcome.features)) expect(screen.getByText(text)).toBeTruthy();
  expect(screen.getByText(welcome.caption)).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: welcome.cta }));
  expect(mockPush).toHaveBeenCalledWith('/sign-in');
});

test('checks the server, then enables Sign in and follows §5', async () => {
  await render(<SignIn />);
  expect(submitButton().props.accessibilityState).toMatchObject({ disabled: true });

  await fillIn('https://aster.test/', 'owner@example.test', 'pw');
  await waitFor(() => expect(screen.getByText(reachable)).toBeTruthy(), wait);
  expect(submitButton().props.accessibilityState).toMatchObject({ disabled: false });

  await fireEvent.press(submitButton());
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/unlock-owner'), wait);
  expect(useFirstRunStore.getState().serverUrl).toBe('https://aster.test');
});

test('shows the https and unreachable states', async () => {
  await render(<SignIn />);
  const server = screen.getByLabelText(copy.serverLabel);

  await fireEvent.changeText(server, 'http://aster.test');
  await fireEvent(server, 'blur');
  await waitFor(() => expect(screen.getByText(copy.needsHttps)).toBeTruthy(), wait);

  await fireEvent.changeText(server, 'https://unreachable.test');
  await waitFor(() => expect(screen.getByText(copy.unreachable)).toBeTruthy(), wait);
  expect(submitButton().props.accessibilityState).toMatchObject({ disabled: true });
});

test('maps wrong credentials and 429 to the §4.2 copy', async () => {
  await render(<SignIn />);
  await fillIn('https://aster.test', 'a@example.test', 'wrong');
  await waitFor(() => expect(screen.getByText(reachable)).toBeTruthy(), wait);

  await fireEvent.press(submitButton());
  await waitFor(() => expect(screen.getByText(copy.wrongCredentials)).toBeTruthy(), wait);

  await fireEvent.changeText(screen.getByLabelText(copy.passwordLabel), 'throttle');
  await fireEvent.press(submitButton());
  await waitFor(() => expect(screen.getByText(copy.tooManyTries(30))).toBeTruthy(), wait);
  expect(mockPush).not.toHaveBeenCalled();
});

test('register mode swaps the copy and pushes 1.3 with credentials in memory only', async () => {
  await render(<SignIn />);
  await fireEvent.press(screen.getByRole('button', { name: copy.registerLink }));
  expect(screen.getByText(copy.registerTitle)).toBeTruthy();
  expect(screen.getByText(copy.passwordHelper)).toBeTruthy();
  expect(screen.getByRole('button', { name: copy.signInLink })).toBeTruthy();

  await fillIn('https://aster.test', 'new@example.test', 'short');
  await waitFor(() => expect(screen.getByText(reachable)).toBeTruthy(), wait);
  await fireEvent.press(submitButton(copy.registerSubmit));
  expect(mockPush).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText(copy.passwordLabel), 'long-enough');
  await fireEvent.press(submitButton(copy.registerSubmit));
  expect(mockPush).toHaveBeenCalledWith('/create-owner');
  expect(useFirstRunStore.getState().pendingRegistration).toEqual({
    email: 'new@example.test',
    password: 'long-enough',
  });
});
