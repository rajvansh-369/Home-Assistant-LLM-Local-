// Voice V1 (docs/aster-voice-plan.md): sentences for speaking, the listen and speaker wrappers over
// the native module's Jest mock, the per-phone settings and who may use voice.
import AsyncStorage from '@react-native-async-storage/async-storage';

import AsterSystem from '../modules/aster-system';

import type { Session } from '@/features/first-run/store';
import { voiceAllowed, voiceReady } from '@/features/voice/access';
import { createSentenceSplitter, MAX_SENTENCE, speakable } from '@/features/voice/sentences';
import { DEFAULT_VOICE_SETTINGS, useVoiceSettings } from '@/features/voice/settings';
import { createSpeaker, listen, LISTEN_MAX_MS } from '@/features/voice/speech';
import type { Profile } from '@/services/api';

type MockSystem = typeof AsterSystem & {
  __state: {
    listens: { session: number; language: string | null; maxMs: number }[];
    queued: { text: string; id: string }[];
    voiceSettings: { voice: string | null; rate: number } | null;
    speech: { available: boolean; onDevice: boolean };
  };
  __reset(): void;
  __emit(event: string, payload?: unknown): void;
  __session(): number;
};
const system = AsterSystem as MockSystem;

beforeEach(() => system.__reset());

describe('sentences', () => {
  test('speakable drops Markdown, links and code', () => {
    expect(speakable('**Done.** See [the docs](https://x.test) or https://y.test now')).toBe(
      'Done. See the docs or now',
    );
    expect(speakable('- first item')).toBe('first item');
    expect(speakable('1. Call `Mom`')).toBe('Call Mom');
    expect(speakable('```js\nconst a = 1;\n```')).toBe('');
  });

  test('the splitter gives sentences as soon as they end, and the rest on flush', () => {
    const split = createSentenceSplitter();
    expect(split.push('It is 1.5 hours. Then')).toEqual(['It is 1.5 hours.']);
    expect(split.push(' you arrive! Want')).toEqual(['Then you arrive!']);
    expect(split.push(' a reminder')).toEqual([]);
    expect(split.flush()).toEqual(['Want a reminder']);
  });

  test('list items are their own sentences; long text is cut at a space', () => {
    const split = createSentenceSplitter();
    expect(split.push('Here:\n- **Milk**\n- Eggs\n')).toEqual(['Here:', 'Milk', 'Eggs']);
    const long = split.push(`${'word '.repeat(60)}`);
    expect(long).toHaveLength(1);
    expect(long[0].length).toBeLessThanOrEqual(MAX_SENTENCE);
  });

  test('a code block is held until it closes, then dropped', () => {
    const split = createSentenceSplitter();
    expect(split.push('Try this:\n```\nls -la.\n')).toEqual(['Try this:']);
    expect(split.push('```\nDone.')).toEqual([]);
    expect(split.flush()).toEqual(['Done.']);
  });
});

describe('listening', () => {
  test('partials and the final words of this session only', async () => {
    const partials: string[] = [];
    const heard = listen({ onPartial: (text) => partials.push(text) });
    const session = system.__session();
    expect(system.__state.listens).toEqual([{ session, language: null, maxMs: LISTEN_MAX_MS }]);

    system.__emit('onSpeechPartial', { session: session - 1, text: 'old' });
    system.__emit('onSpeechPartial', { session, text: 'remind me' });
    system.__emit('onSpeechResult', { session, text: 'remind me at nine' });
    await expect(heard.result).resolves.toEqual({ kind: 'text', text: 'remind me at nine' });
    expect(partials).toEqual(['remind me']);
  });

  test('errors, cancel, and no recognizer', async () => {
    const failing = listen();
    system.__emit('onSpeechError', { session: system.__session(), kind: 'no-speech' });
    await expect(failing.result).resolves.toEqual({ kind: 'error', error: 'no-speech' });

    const cancelled = listen();
    cancelled.cancel();
    await expect(cancelled.result).resolves.toEqual({ kind: 'error', error: 'cancelled' });
    expect(AsterSystem.cancelListening).toHaveBeenCalled();

    system.__state.speech = { available: false, onDevice: false };
    await expect(listen().result).resolves.toEqual({ kind: 'error', error: 'failed' });
  });
});

describe('speaking', () => {
  test('sentences are queued and idle waits for every one', async () => {
    const speaker = createSpeaker();
    speaker.say('First.');
    speaker.say('Second.');
    const [first, second] = system.__state.queued;
    expect([first.text, second.text]).toEqual(['First.', 'Second.']);

    let idle = false;
    const done = speaker.idle().then(() => {
      idle = true;
    });
    system.__emit('onSpeakDone', { id: first.id, spoken: true });
    await Promise.resolve();
    expect(idle).toBe(false);
    system.__emit('onSpeakDone', { id: second.id, spoken: true });
    await done;
    expect(speaker.speaking()).toBe(false);
    speaker.dispose();
  });

  test('stop silences it and releases waiters', async () => {
    const speaker = createSpeaker();
    speaker.say('Long answer.');
    const done = speaker.idle();
    speaker.stop();
    await done;
    expect(AsterSystem.stopSpeaking).toHaveBeenCalled();
    speaker.dispose();
  });
});

describe('settings and access', () => {
  test('voice and speed reach the native speaker and are kept on the phone', async () => {
    await AsyncStorage.clear();
    useVoiceSettings.getState().set({ ...DEFAULT_VOICE_SETTINGS });
    useVoiceSettings.getState().set({ voice: 'en-in-x-ene-local', rate: 1.2 });
    expect(system.__state.voiceSettings).toEqual({ voice: 'en-in-x-ene-local', rate: 1.2 });
    useVoiceSettings.getState().set({ wakeWord: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const saved = JSON.parse((await AsyncStorage.getItem('aster.voice'))!);
    expect(saved.state).toEqual({ wakeWord: false, voice: 'en-in-x-ene-local', rate: 1.2 });
  });

  test('voice needs a non-Guest profile with voice and chat on, then a token and home', () => {
    const profile = (patch: Partial<Profile> = {}): Profile => ({
      id: 1,
      name: 'Asha',
      color: '#7FD9B8',
      role: 'member',
      ...patch,
    });
    expect(voiceAllowed(profile())).toBe(true);
    expect(voiceAllowed(profile({ voice_enabled: false }))).toBe(false);
    expect(voiceAllowed(profile({ chat_enabled: false }))).toBe(false);
    expect(voiceAllowed(profile({ role: 'guest' }))).toBe(false);
    expect(voiceAllowed(null)).toBe(false);

    const session = (llmToken: string | null): Session => ({
      profileToken: 'p',
      llmToken,
      expiresAt: '2099-01-01T00:00:00Z',
      profile: profile(),
    });
    const ready = { kind: 'ready', busy: false } as const;
    expect(voiceReady(session('jwt'), ready)).toBe(true);
    expect(voiceReady(session(null), ready)).toBe(false);
    expect(voiceReady(session('jwt'), { kind: 'away', distanceM: null })).toBe(false);
  });
});
