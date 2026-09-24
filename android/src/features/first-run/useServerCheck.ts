// 1.2 server check (plan §4.2): runs 600 ms after typing stops and on blur, calling
// GET {server}/up through the API layer (5 s timeout). Stale replies are ignored.
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/services/api';

import { checkServerUrl } from './validators';

export const SERVER_CHECK_DEBOUNCE_MS = 600;
const SERVER_CHECK_TIMEOUT_MS = 5000;

export type ServerCheck =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; url: string; ms: number }
  | { kind: 'https' }
  | { kind: 'failed' };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function useServerCheck(input: string, allowDevHttp: boolean = __DEV__) {
  const [check, setCheck] = useState<ServerCheck>({ kind: 'idle' });
  const requestId = useRef(0);
  const checkedInput = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const run = useCallback(
    async (value: string) => {
      clearTimeout(timer.current);
      if (checkedInput.current === value) return;
      checkedInput.current = value;
      const id = ++requestId.current;
      const result = checkServerUrl(value, allowDevHttp);
      if (!result.ok) {
        setCheck(result.reason === 'empty' ? { kind: 'idle' } : { kind: 'https' });
        return;
      }
      setCheck({ kind: 'checking' });
      try {
        const { ms } = await withTimeout(api.checkServer(result.url), SERVER_CHECK_TIMEOUT_MS);
        if (id === requestId.current) setCheck({ kind: 'ok', url: result.url, ms });
      } catch {
        if (id === requestId.current) setCheck({ kind: 'failed' });
      }
    },
    [allowDevHttp],
  );

  // Typing resets the status and restarts the debounce.
  useEffect(() => {
    if (checkedInput.current === input) return;
    requestId.current++;
    setCheck({ kind: 'idle' });
    timer.current = setTimeout(() => run(input), SERVER_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer.current);
  }, [input, run]);

  /** On blur: check now instead of waiting for the debounce. */
  const checkNow = useCallback(() => run(input), [input, run]);

  /** A sign-in call failed on the network: show the server as unreachable. */
  const markFailed = useCallback(() => {
    requestId.current++;
    checkedInput.current = null; // the next blur checks again
    setCheck({ kind: 'failed' });
  }, []);

  return { check, checkNow, markFailed };
}
