// Speech in and out for 3.6 Voice (docs/aster-voice-plan.md §4), over the native module: one
// listen at a time, its events filtered by session; and a speaker that queues sentences and knows
// when it has finished. What was said is never logged.
import AsterSystem, {
  type SpeechErrorKind,
  type Subscription,
} from '../../../modules/aster-system';

/** How long one listen may last before it is stopped. */
export const LISTEN_MAX_MS = 15_000;

export type ListenResult =
  { kind: 'text'; text: string } | { kind: 'error'; error: SpeechErrorKind };

export type ListenOptions = {
  /** BCP 47, or null for the phone's language. */
  language?: string | null;
  maxMs?: number;
  onPartial?: (text: string) => void;
  onState?: (state: 'listening' | 'speaking' | 'ended') => void;
};

export type Listen = {
  result: Promise<ListenResult>;
  /** Stop and keep what was heard. */
  stop(): void;
  /** Stop with no result: resolves `cancelled`. */
  cancel(): void;
};

/** Starts listening. Without a recognizer it resolves `failed` at once. */
export function listen(options: ListenOptions = {}): Listen {
  const subscriptions: Subscription[] = [];
  let settle: (result: ListenResult) => void = () => {};
  let done = false;
  const result = new Promise<ListenResult>((resolve) => {
    settle = (value) => {
      if (done) return;
      done = true;
      subscriptions.forEach((s) => s.remove());
      resolve(value);
    };
  });

  if (!AsterSystem.speechAvailability().available) {
    settle({ kind: 'error', error: 'failed' });
    return { result, stop() {}, cancel() {} };
  }

  // Listeners first, so no event of this session is missed.
  let session = -1;
  const mine = (event: { session: number }) => event.session === session;
  subscriptions.push(
    AsterSystem.addListener('onSpeechPartial', (e) => {
      if (mine(e)) options.onPartial?.(e.text);
    }),
    AsterSystem.addListener('onSpeechState', (e) => {
      if (mine(e)) options.onState?.(e.state);
    }),
    AsterSystem.addListener('onSpeechResult', (e) => {
      if (mine(e)) settle({ kind: 'text', text: e.text });
    }),
    AsterSystem.addListener('onSpeechError', (e) => {
      if (mine(e)) settle({ kind: 'error', error: e.kind });
    }),
  );
  session = AsterSystem.startListening(options.language ?? null, options.maxMs ?? LISTEN_MAX_MS);

  return {
    result,
    stop: () => AsterSystem.stopListening(),
    cancel: () => {
      AsterSystem.cancelListening();
      settle({ kind: 'error', error: 'cancelled' });
    },
  };
}

let nextId = 0;

/**
 * Says sentences one after another. `idle()` resolves when everything queued has been said (or
 * stopped); `stop()` silences it at once.
 */
export function createSpeaker() {
  const pending = new Set<string>();
  let waiters: (() => void)[] = [];
  const wake = () => {
    if (pending.size > 0) return;
    const list = waiters;
    waiters = [];
    list.forEach((w) => w());
  };
  const subscription = AsterSystem.addListener('onSpeakDone', ({ id }) => {
    if (pending.delete(id)) wake();
  });

  return {
    say(sentence: string) {
      const id = `s${++nextId}`;
      pending.add(id);
      AsterSystem.speakQueued(sentence, id);
    },
    speaking: () => pending.size > 0,
    idle(): Promise<void> {
      return pending.size === 0 ? Promise.resolve() : new Promise((r) => waiters.push(r));
    },
    stop() {
      AsterSystem.stopSpeaking();
      pending.clear();
      wake();
    },
    dispose() {
      subscription.remove();
      pending.clear();
      wake();
    },
  };
}
