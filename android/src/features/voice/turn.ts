// The voice turn of 3.6 (docs/aster-voice-plan.md §2, §4): listen → ask → speak → listen once more
// for a follow-up. Questions and answers go through the chat (useChat with `voice`), so a voice
// session is an ordinary saved chat, uploaded with the `voice` flag. Answers are spoken sentence by
// sentence as they stream; Mute keeps the text and stops the speech; the mic interrupts speaking.
// What was said is never logged.
import { useCallback, useEffect, useRef, useState } from 'react';

import { useChat } from '@/features/chat/useChat';

import { voice as copy } from './copy';
import { ensureMicrophone } from './mic';
import { createSentenceSplitter, speakable } from './sentences';
import { createSpeaker, listen, type Listen } from './speech';

export type VoicePhase = 'paused' | 'listening' | 'thinking' | 'speaking';

/** Why the session is paused with a message; `blocked` offers the app's settings. */
export type VoiceNotice = { text: string; settings?: boolean };

export type VoiceTurnOptions = {
  /** A saved chat to continue (3.4's "Talk instead"); null starts one with the first question. */
  chatUuid: string | null;
  /** Voice can answer now (voiceReady): at home with the model ready. */
  ready: boolean;
};

export function useVoiceTurn({ chatUuid, ready }: VoiceTurnOptions) {
  const [phase, setPhase] = useState<VoicePhase>('paused');
  const [heard, setHeard] = useState('');
  const [answer, setAnswer] = useState('');
  const [notice, setNotice] = useState<VoiceNotice | null>(null);
  const [muted, setMuted] = useState(false);

  // Every start or pause begins a new generation; work from an older one stops where it is.
  const generation = useRef(0);
  const current = useRef<Listen | null>(null);
  const speaker = useRef<ReturnType<typeof createSpeaker> | null>(null);
  const splitter = useRef<ReturnType<typeof createSentenceSplitter> | null>(null);
  const mutedRef = useRef(false);

  const say = useCallback((sentence: string) => {
    if (mutedRef.current || !speaker.current) return;
    speaker.current.say(sentence);
    setPhase((p) => (p === 'thinking' ? 'speaking' : p));
  }, []);

  const onText = useCallback(
    (chunk: string) => {
      setAnswer((text) => text + chunk);
      splitter.current?.push(chunk).forEach(say);
    },
    [say],
  );

  const chat = useChat('saved', chatUuid, { voice: true, onText });
  const chatRef = useRef(chat);
  useEffect(() => {
    chatRef.current = chat;
  });

  const silence = useCallback(() => {
    current.current?.cancel();
    current.current = null;
    splitter.current = null;
    speaker.current?.stop();
    chatRef.current.stop();
  }, []);

  const pause = useCallback(() => {
    generation.current += 1;
    silence();
    setPhase('paused');
  }, [silence]);

  // Declared before `start`, which it calls back into for the follow-up.
  const startRef = useRef<(followUp: boolean) => Promise<void>>(async () => {});

  const ask = useCallback(
    async (question: string, gen: number) => {
      setHeard(question);
      setAnswer('');
      setPhase('thinking');
      splitter.current = createSentenceSplitter();
      const outcome = await chatRef.current.send(question);
      if (gen !== generation.current) return;
      splitter.current?.flush().forEach(say);
      splitter.current = null;
      if (!outcome || outcome.cancelled) {
        setPhase('paused');
        return;
      }
      if (outcome.error) {
        setNotice({ text: outcome.error });
        const spoken = speakable(outcome.error);
        if (spoken) say(spoken);
      }
      await speaker.current?.idle();
      if (gen !== generation.current) return;
      if (outcome.error) {
        setPhase('paused');
        return;
      }
      void startRef.current(true);
    },
    [say],
  );

  const start = useCallback(
    async (followUp: boolean) => {
      const gen = ++generation.current;
      silence();
      setNotice(null);
      if (!ready) {
        setPhase('paused');
        return;
      }
      setPhase('listening');
      const mic = await ensureMicrophone();
      if (gen !== generation.current) return;
      if (mic !== 'allowed') {
        setNotice({ text: copy.micBlocked, settings: mic === 'blocked' });
        setPhase('paused');
        return;
      }
      let cleared = false;
      const session = listen({
        onPartial: (text) => {
          if (gen !== generation.current) return;
          if (!cleared) {
            cleared = true;
            setAnswer('');
          }
          setHeard(text);
        },
      });
      current.current = session;
      const result = await session.result;
      if (gen !== generation.current) return;
      current.current = null;
      if (result.kind === 'text' && result.text.trim() !== '') {
        await ask(result.text.trim(), gen);
        return;
      }
      setPhase('paused');
      const error = result.kind === 'error' ? result.error : 'no-speech';
      // A follow-up nobody answered just pauses (voice plan §3).
      if (error === 'cancelled' || (followUp && error === 'no-speech')) return;
      if (error === 'no-speech') setNotice({ text: copy.noSpeech });
      else if (error === 'permission') setNotice({ text: copy.micBlocked, settings: true });
      else if (error === 'busy' || error === 'audio') setNotice({ text: copy.micBusy });
      else if (error === 'language') setNotice({ text: copy.noRecognizer });
      else setNotice({ text: copy.failed });
    },
    [ask, ready, silence],
  );
  useEffect(() => {
    startRef.current = start;
  });

  /** The big mic: pauses while listening; otherwise interrupts whatever is going on and listens. */
  const toggleMic = useCallback(() => {
    if (phase === 'listening') pause();
    else void start(false);
  }, [pause, phase, start]);

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    if (mutedRef.current) {
      speaker.current?.stop();
      setPhase((p) => (p === 'speaking' ? 'thinking' : p));
    }
  }, []);

  useEffect(() => {
    speaker.current = createSpeaker();
    return () => {
      generation.current += 1;
      current.current?.cancel();
      speaker.current?.stop();
      speaker.current?.dispose();
      speaker.current = null;
    };
  }, []);

  // Leaving home (or the model going away) pauses the session: the phase now, while rendering;
  // the microphone, the stream and the speech in the effect.
  const [wasReady, setWasReady] = useState(ready);
  if (wasReady !== ready) {
    setWasReady(ready);
    if (!ready) setPhase('paused');
  }
  useEffect(() => {
    if (ready) return;
    generation.current += 1;
    silence();
  }, [ready, silence]);

  return {
    phase,
    heard,
    answer,
    notice,
    muted,
    chatUuid: chat.chatUuid,
    start: () => start(false),
    pause,
    toggleMic,
    toggleMute,
  };
}
