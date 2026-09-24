import { act, renderHook } from '@testing-library/react-native';

import {
  createOwner,
  RegisterRejectedError,
  resetFirstRun,
  startRegistration,
} from '@/features/first-run/actions';
import { signIn as signInCopy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { useCountdown } from '@/features/first-run/useCountdown';
import { ApiError } from '@/services/api';
import { mockApi, setMockLatency } from '@/services/api/mock';
import * as secure from '@/services/secure';

const server = 'https://aster.test';
const owner = { name: 'Test', color: 'peach' as const, pin: '246810', fingerprint: false, lockWhenLeave: true };

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  jest.restoreAllMocks();
  await resetFirstRun();
});

function spyOnChain() {
  return {
    register: jest.spyOn(mockApi, 'register'),
    createProfile: jest.spyOn(mockApi, 'createProfile'),
    unlockProfile: jest.spyOn(mockApi, 'unlockProfile'),
  };
}

describe('create chain (plan §5)', () => {
  test('register, then create the Owner, then unlock, in that order', async () => {
    const spies = spyOnChain();
    startRegistration({ server, email: 'new@example.test', password: 'long-enough' });

    expect(await createOwner(owner)).toBe('/set-home');

    const order = [spies.register, spies.createProfile, spies.unlockProfile].map(
      (spy) => spy.mock.invocationCallOrder[0],
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(spies.createProfile.mock.calls[0][2]).toMatchObject({
      name: 'Test',
      role: 'owner',
      pin: '246810',
      auto_lock_minutes: 2,
    });
    const state = useFirstRunStore.getState();
    expect(state.session?.profileToken).toBeTruthy();
    expect(state.owner).toMatchObject({ name: 'Test', color: 'peach' });
  });

  test('stops at the first failure', async () => {
    const spies = spyOnChain();
    spies.createProfile.mockRejectedValueOnce(new ApiError(500, 'Server Error'));
    startRegistration({ server, email: 'new@example.test', password: 'long-enough' });

    await expect(createOwner(owner)).rejects.toMatchObject({ status: 500 });
    expect(spies.register).toHaveBeenCalledTimes(1);
    expect(spies.unlockProfile).not.toHaveBeenCalled();

    // Retrying skips the register step that already succeeded.
    expect(await createOwner(owner)).toBe('/set-home');
    expect(spies.register).toHaveBeenCalledTimes(1);
  });

  test('register 422 on email sends the user back to 1.2 in register mode', async () => {
    const spies = spyOnChain();
    startRegistration({ server, email: 'taken@example.test', password: 'long-enough' });

    await expect(createOwner(owner)).rejects.toBeInstanceOf(RegisterRejectedError);
    expect(spies.createProfile).not.toHaveBeenCalled();
    expect(useFirstRunStore.getState().signInReturn).toEqual({
      mode: 'register',
      field: 'email',
      message: 'The email has already been taken.',
    });
  });

  test('household exists sends the user back to 1.2 in sign-in mode', async () => {
    startRegistration({ server, email: 'exists@example.test', password: 'long-enough' });

    await expect(createOwner(owner)).rejects.toBeInstanceOf(RegisterRejectedError);
    const state = useFirstRunStore.getState();
    expect(state.signInReturn).toEqual({ mode: 'signIn' });
    expect(state.signInNotice).toBe(signInCopy.householdExists);
    expect(state.pendingRegistration).toBeNull();
  });

  test('a cancelled fingerprint prompt turns fingerprint off without blocking', async () => {
    jest.spyOn(secure, 'saveBiometricPin').mockRejectedValueOnce(new Error('cancelled'));
    startRegistration({ server, email: 'new@example.test', password: 'long-enough' });

    expect(await createOwner({ ...owner, fingerprint: true })).toBe('/set-home');
    expect(useFirstRunStore.getState().fingerprintEnabled).toBe(false);
  });
});

describe('lock countdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('counts down whole seconds to zero', async () => {
    const { result } = await renderHook(() => useCountdown());
    expect(result.current.running).toBe(false);

    await act(async () => result.current.start(3));
    expect(result.current).toMatchObject({ remaining: 3, running: true });

    for (const expected of [2, 1, 0]) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.remaining).toBe(expected);
    }
    expect(result.current.running).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(result.current.remaining).toBe(0);
  });
});
