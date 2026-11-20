// Voice V5 (docs/aster-voice-plan.md §3, §5): 5.1's Voice section, the "Voice and speech" screen,
// 3.2's words, 3.4's "Read aloud" and the `voice_read` activity. The native side is the module's
// Jest mock.
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { PermissionsAndroid } from 'react-native';

import AsterSystem, { type CapturedThread, type DeviceVoice } from '../modules/aster-system';

import Settings from '@/app/(tabs)/settings';
import { AssistantMessage } from '@/components';
import { chat as chatCopy } from '@/features/chat/copy';
import { resetFirstRun, signIn, unlockOwner } from '@/features/first-run/actions';
import { useFirstRunStore, type Session } from '@/features/first-run/store';
import { home as homeCopy } from '@/features/home/copy';
import * as uploads from '@/features/location/uploads';
import { useAlertsStore } from '@/features/messages/alerts';
import { voice as copy } from '@/features/voice/copy';
import { markHeard } from '@/features/voice/doing';
import { readAloud, stopReading, useReadAloud } from '@/features/voice/readAloud';
import { useVoiceSettings } from '@/features/voice/settings';
import { VoiceSettingsScreen } from '@/features/voice/VoiceSettingsScreen';
import { nameVoices, resetVoiceCache, voiceLabel } from '@/features/voice/voices';
import type { VipContact } from '@/services/api';
import { setMockLatency } from '@/services/api/mock';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn() },
  useFocusEffect: jest.fn(),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = jest.requireActual('react-native');
    return <Text>{`redirect:${href}`}</Text>;
  },
}));

type MockState = {
  voices: DeviceVoice[];
  speech: { available: boolean; onDevice: boolean };
  queued: { text: string; id: string }[];
  voiceSettings: unknown;
  wake: { error: string | null };
};
const system = AsterSystem as typeof AsterSystem & {
  __state: MockState;
  __reset(): void;
  __emit(event: string, payload?: unknown): void;
};

const s = copy.settings;

const v = (name: string, locale: string, quality = 300): DeviceVoice => ({ name, locale, quality });

beforeAll(() => setMockLatency(0, 0));

beforeEach(async () => {
  system.__reset();
  resetVoiceCache();
  jest.mocked(router.push).mockClear();
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  await resetFirstRun();
  await signIn({ server: 'https://aster.test', email: 'owner@example.test', password: 'pw' });
  await unlockOwner('123456');
  useVoiceSettings.setState({ wakeWord: true, voice: null, rate: 1.0 });
});

describe('the phone’s voices', () => {
  const voices = [
    v('en-us-x-sfg-local', 'en-US', 400),
    v('hi-in-x-hia-local', 'hi-IN'),
    v('en-in-x-ahp-local', 'en-IN', 300),
    v('en-in-x-cxx-local', 'en_IN', 400),
    v('fr-fr-x-frc-local', 'fr-FR'),
    v('en-za-x-zaa-local', 'en-ZA'),
  ];

  test('English and Hindi only, the phone’s region first, numbered best first', () => {
    expect(nameVoices(voices, 'IN').map((x) => [x.name, x.label])).toEqual([
      ['en-in-x-cxx-local', 'English (India) 1'],
      ['en-in-x-ahp-local', 'English (India) 2'],
      ['hi-in-x-hia-local', 'Hindi 1'],
      ['en-us-x-sfg-local', 'English (US) 1'],
      ['en-za-x-zaa-local', 'English (ZA) 1'],
    ]);
  });

  test('the row names the chosen voice, or the device voice', () => {
    const named = nameVoices(voices, 'IN');
    expect(voiceLabel(null, named)).toBe(s.deviceVoice);
    expect(voiceLabel('en-in-x-ahp-local', named)).toBe('English (India) 2');
    expect(voiceLabel('gone', named)).toBe(s.deviceVoice);
  });
});

describe('5.1 Voice', () => {
  test('as drawn, between Home and location and Alerts and background', async () => {
    await render(<Settings />);
    expect(await screen.findByText(s.section)).toBeTruthy();
    expect(screen.getByText(s.wakeWord)).toBeTruthy();
    expect(screen.getByText(s.wakeWordDetail)).toBeTruthy();
    expect(screen.getByText('Device voice · 1.0× · recognition on this phone')).toBeTruthy();
    const texts = screen.getAllByRole('header').map((h) => h.props.children);
    expect(texts.indexOf(s.section)).toBeGreaterThan(texts.indexOf('Home and location'));
    expect(texts.indexOf(s.section)).toBeLessThan(texts.indexOf('Alerts and background'));

    await fireEvent.press(screen.getByText(s.voiceAndSpeech));
    expect(router.push).toHaveBeenCalledWith('/voice-settings');
  });

  test('the switch turns the wake word off and on', async () => {
    await render(<Settings />);
    const toggle = screen.getByRole('switch', { name: s.wakeWord });
    await fireEvent(toggle, 'valueChange', false);
    expect(useVoiceSettings.getState().wakeWord).toBe(false);
    await fireEvent(toggle, 'valueChange', true);
    expect(useVoiceSettings.getState().wakeWord).toBe(true);
  });

  test('says the chosen voice, speed and Google recognition; a build without the model', async () => {
    system.__state.voices = [v('en-in-x-ahp-local', 'en-IN')];
    system.__state.speech = { available: true, onDevice: false };
    system.__state.wake.error = 'models';
    useVoiceSettings.setState({ voice: 'en-in-x-ahp-local', rate: 1.2 });
    await render(<Settings />);
    expect(
      await screen.findByText('English (India) 1 · 1.2× · recognition by Google'),
    ).toBeTruthy();
    expect(screen.getByText(s.wakeWordMissing)).toBeTruthy();
  });

  test('says when the switch is on but the microphone isn’t allowed', async () => {
    jest.mocked(PermissionsAndroid.check).mockResolvedValue(false);
    await render(<Settings />);
    expect(await screen.findByText(s.wakeWordNoMic)).toBeTruthy();
    expect(screen.getByRole('button', { name: s.allowMic })).toBeTruthy();
  });

  test('hidden for a profile without voice', async () => {
    const session = useFirstRunStore.getState().session as Session;
    useFirstRunStore
      .getState()
      .set({ session: { ...session, profile: { ...session.profile, voice_enabled: false } } });
    await render(<Settings />);
    expect(screen.queryByText(s.section)).toBeNull();
  });
});

describe('Voice and speech', () => {
  test('picks a voice and a speed, and Test says a sentence with them', async () => {
    system.__state.voices = [v('en-in-x-ahp-local', 'en-IN'), v('hi-in-x-hia-local', 'hi-IN')];
    await render(<VoiceSettingsScreen />);
    expect(screen.getByRole('radio', { name: s.phoneDefault }).props.accessibilityState).toMatchObject({
      checked: true,
    });

    await fireEvent.press(await screen.findByRole('radio', { name: 'Hindi 1' }));
    expect(useVoiceSettings.getState().voice).toBe('hi-in-x-hia-local');
    expect(AsterSystem.setVoiceSettings).toHaveBeenLastCalledWith('hi-in-x-hia-local', 1.0);

    await fireEvent.press(screen.getByRole('radio', { name: '0.8×' }));
    expect(AsterSystem.setVoiceSettings).toHaveBeenLastCalledWith('hi-in-x-hia-local', 0.8);

    await fireEvent.press(screen.getByRole('button', { name: s.test }));
    expect(system.__state.queued.map((q) => q.text)).toEqual([s.testSentence]);
    expect(screen.getByText(s.recognitionHereFull)).toBeTruthy();

    await fireEvent.press(screen.getByRole('radio', { name: s.phoneDefault }));
    expect(useVoiceSettings.getState().voice).toBeNull();
  });

  test('only the phone’s default voice', async () => {
    system.__state.speech = { available: false, onDevice: false };
    await render(<VoiceSettingsScreen />);
    expect(await screen.findByText(s.noVoices)).toBeTruthy();
    expect(screen.getByText(s.recognitionNoneFull)).toBeTruthy();
  });
});

describe('3.2 away', () => {
  test('names voice only for profiles that have it', () => {
    expect(homeCopy.away.body).toBe(
      'Chat and voice switch on when you get home. Reminders, message capture and location keep working.',
    );
    expect(homeCopy.away.bodyNoVoice).not.toContain('voice');
  });
});

describe('3.4 Read aloud', () => {
  afterEach(() => stopReading());

  test('reads an answer sentence by sentence and ends by itself', () => {
    readAloud('a1', 'Hello **there**. It is [sunny](https://x.test) today.');
    expect(system.__state.queued.map((q) => q.text)).toEqual(['Hello there.', 'It is sunny today.']);
    expect(useReadAloud.getState().reading).toBe('a1');
    return act(async () => {
      for (const { id } of system.__state.queued) system.__emit('onSpeakDone', { id, spoken: true });
    }).then(() => expect(useReadAloud.getState().reading).toBeNull());
  });

  test('Stop reading silences it; another answer takes over', () => {
    readAloud('a1', 'One. Two.');
    readAloud('a2', 'Three.');
    expect(useReadAloud.getState().reading).toBe('a2');
    stopReading();
    expect(AsterSystem.stopSpeaking).toHaveBeenCalled();
    expect(useReadAloud.getState().reading).toBeNull();
  });

  test('the answer shows Read aloud, then Stop reading', async () => {
    const onReadAloud = jest.fn();
    const view = await render(<AssistantMessage content="Hi." onReadAloud={onReadAloud} />);
    await fireEvent.press(screen.getByRole('button', { name: chatCopy.readAloud }));
    expect(onReadAloud).toHaveBeenCalled();
    await view.rerender(<AssistantMessage content="Hi." onReadAloud={onReadAloud} reading />);
    expect(screen.getByRole('button', { name: chatCopy.stopReading })).toBeTruthy();
  });
});

describe('voice_read activity', () => {
  const message = (threadKey: string, id: number) => ({
    id,
    threadKey,
    source: 'whatsapp' as const,
    sender: 'Asha',
    text: 'secret words',
    at: 1,
    outgoing: false,
    otp: false,
    read: false,
    spokenAt: null,
  });
  const thread = (key: string, title: string): CapturedThread => ({
    key,
    source: 'whatsapp',
    title,
    isGroup: false,
    count: 1,
    unreadSenders: [title],
    spokenAt: null,
    canReply: true,
    last: message(key, 1),
  });

  test('counts and a VIP’s name, never the text', async () => {
    const queue = jest.spyOn(uploads, 'queueEvents').mockResolvedValue();
    useAlertsStore.setState({
      vips: [
        { id: 1, name: 'Asha', match_key: 'asha', sources: ['whatsapp'], enabled: true } as VipContact,
      ],
    });
    const asha = thread('whatsapp-1', 'Asha');
    await markHeard([
      { thread: asha, message: message(asha.key, 1) },
      { thread: asha, message: message(asha.key, 2) },
    ]);
    const other = thread('whatsapp-2', 'Someone');
    await markHeard(
      [
        { thread: asha, message: message(asha.key, 3) },
        { thread: other, message: message(other.key, 4) },
      ],
      true,
    );
    const events = queue.mock.calls.map(([batch]) => batch[0]);
    expect(events).toMatchObject([
      {
        type: 'voice_read',
        summary: 'Read out 2 missed messages from Asha',
        meta: { messages: 2, chats: 1, summed: false },
      },
      {
        type: 'voice_read',
        summary: 'Read out 2 missed messages',
        meta: { messages: 2, chats: 2, summed: true },
      },
    ]);
    expect(JSON.stringify(events)).not.toContain('secret');
    expect(AsterSystem.markThreadSeen).toHaveBeenCalledWith(other.key);
    queue.mockRestore();
  });
});
