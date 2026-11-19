// The voice turn of 3.6 (docs/aster-voice-plan.md §2, §4): listen → ask → speak → listen once more
// for a follow-up. Questions and answers go through the chat (useChat with `voice`), so a voice
// session is an ordinary saved chat, uploaded with the `voice` flag. Answers are spoken sentence by
// sentence as they stream; Mute keeps the text and stops the speech; the mic interrupts speaking.
// What was said is never logged. V3 (§5): what was heard goes through the intents first —
// reminders, reading missed messages and replying with confirmation are done on the phone and
// never reach the chat (turns about captured messages stay private).
import { useCallback, useEffect, useRef, useState } from 'react';

import { useChat } from '@/features/chat/useChat';
import { writeCatchUp } from '@/features/messages/catchup';
import { draftReplies } from '@/features/messages/drafts';

import type { CapturedMessage, CapturedThread } from '../../../modules/aster-system';

import { voice as copy } from './copy';
import {
  findMissed,
  markHeard,
  mayUseMessages,
  mayUseReminders,
  openThread,
  readOut,
  READ_OUT_AT_MOST,
  reply,
  saveReminder,
  threadName,
} from './doing';
import { parseIntent, type VoiceIntent } from './intents';
import { ensureMicrophone } from './mic';
import { createSentenceSplitter, speakable } from './sentences';
import { createSpeaker, listen, type Listen } from './speech';

export type VoicePhase = 'paused' | 'listening' | 'thinking' | 'speaking';

/** Why the session is paused with a message; `blocked` offers the app's settings. */
export type VoiceNotice = { text: string; settings?: boolean };

/** A chip under the answer (plan §3): say a drafted reply, send, not now, edit a reminder. */
export type VoiceChip =
  | { kind: 'say'; label: string; text: string }
  | { kind: 'send'; label: string }
  | { kind: 'notNow'; label: string }
  | { kind: 'edit'; label: string; reminder: string };

/** The reminder a voice turn just saved (plan §5's card). */
export type VoiceReminderCard = { clientUuid: string; title: string; when: string };

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
  const [chips, setChips] = useState<VoiceChip[]>([]);
  const [card, setCard] = useState<VoiceReminderCard | null>(null);

  // Every start or pause begins a new generation; work from an older one stops where it is.
  const generation = useRef(0);
  const current = useRef<Listen | null>(null);
  const speaker = useRef<ReturnType<typeof createSpeaker> | null>(null);
  const splitter = useRef<ReturnType<typeof createSentenceSplitter> | null>(null);
  const mutedRef = useRef(false);
  /** The chat "Reply …" answers: after a read-out of one chat, or Reply by voice. */
  const target = useRef<CapturedThread | null>(null);
  /** A reply waiting for "Send" / "Yes". */
  const pending = useRef<{ thread: CapturedThread; text: string } | null>(null);
  /** Chips are showing, so "Not now" means something. */
  const offering = useRef(false);
  /** The catch-up summary being written; stopped by anything new. */
  const work = useRef<AbortController | null>(null);
  /** Reply by voice's draft: keeps going while Aster speaks and listens; stopped by pause. */
  const drafting = useRef<AbortController | null>(null);

  const showChips = useCallback((next: VoiceChip[]) => {
    offering.current = next.length > 0;
    setChips(next);
  }, []);

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
    work.current?.abort();
    work.current = null;
    speaker.current?.stop();
    chatRef.current.stop();
  }, []);

  const pause = useCallback(() => {
    generation.current += 1;
    drafting.current?.abort();
    silence();
    setPhase('paused');
  }, [silence]);

  // Declared before `start`, which it calls back into for the follow-up.
  const startRef = useRef<(followUp: boolean) => Promise<void>>(async () => {});

  /** After everything queued is said: listen once more for a follow-up, or pause. */
  const afterSpeaking = useCallback(async (gen: number, followUp: boolean) => {
    await speaker.current?.idle();
    if (gen !== generation.current) return;
    if (followUp) void startRef.current(true);
    else setPhase('paused');
  }, []);

  /** Shows and says an answer the phone made itself, then listens for a follow-up (or pauses). */
  const respond = useCallback(
    async (text: string, gen: number, followUp = true) => {
      if (gen !== generation.current) return;
      setAnswer(text);
      const sentences = createSentenceSplitter();
      [...sentences.push(text), ...sentences.flush()].forEach(say);
      await afterSpeaking(gen, followUp);
    },
    [afterSpeaking, say],
  );

  /** Offers "Say '{draft}'" for the reply target, written by the local model. Never throws. */
  const offerDraft = useCallback(
    async (thread: CapturedThread, recent: CapturedMessage[]) => {
      const last = recent.at(-1);
      if (!last || last.outgoing || !thread.canReply) return;
      drafting.current?.abort();
      const abort = new AbortController();
      drafting.current = abort;
      try {
        const suggestion = await draftReplies(thread, recent, abort.signal);
        if (abort.signal.aborted) return;
        if (target.current?.key !== thread.key || pending.current) return;
        showChips([
          { kind: 'say', label: copy.say(suggestion.draft), text: suggestion.draft },
          { kind: 'notNow', label: copy.notNow },
        ]);
      } catch {
        // No draft: saying "Reply …" still works.
      } finally {
        if (drafting.current === abort) drafting.current = null;
      }
    },
    [showChips],
  );

  /** Reads missed messages out: the alert engine's words, or the local model's summary of many. */
  const readMissed = useCallback(
    async (name: string | null, gen: number) => {
      if (!mayUseMessages()) return respond(copy.messagesOwnerOnly, gen);
      const { items, thread } = await findMissed(name);
      if (gen !== generation.current) return;
      if (items.length === 0) {
        return respond(name ? copy.noMessagesFrom(name) : copy.noMessages, gen);
      }
      target.current = thread;
      if (items.length > READ_OUT_AT_MOST) {
        const abort = new AbortController();
        work.current = abort;
        const sentences = createSentenceSplitter();
        let seen = 0;
        let summary = '';
        try {
          // writeCatchUp hands over the whole text so far each time.
          summary = await writeCatchUp(
            items,
            (all) => {
              if (gen !== generation.current) return;
              setAnswer(all);
              sentences.push(all.slice(seen)).forEach(say);
              seen = all.length;
            },
            abort.signal,
          );
        } catch {
          summary = '';
        }
        if (gen !== generation.current) return;
        if (work.current === abort) work.current = null;
        if (summary) {
          setAnswer(summary);
          // A cached summary never streamed: say all of it.
          if (seen === 0) sentences.push(summary).forEach(say);
          sentences.flush().forEach(say);
          await markHeard(items);
          await afterSpeaking(gen, true);
          return;
        }
        // The model didn't answer: read them out instead.
      }
      await markHeard(items);
      return respond(readOut(items), gen);
    },
    [afterSpeaking, respond, say],
  );

  /** Does what an intent asks; false when it doesn't apply now and the chat should answer. */
  const act = useCallback(
    async (intent: VoiceIntent, gen: number): Promise<boolean> => {
      const waiting = pending.current;
      switch (intent.kind) {
        case 'stop':
          pending.current = null;
          showChips([]);
          setCard(null);
          setAnswer(copy.stopped);
          setPhase('paused');
          return true;
        case 'confirm': {
          if (!waiting) return false;
          pending.current = null;
          showChips([]);
          const { said } = await reply(waiting.thread, waiting.text);
          await respond(said, gen);
          return true;
        }
        case 'decline':
          if (!waiting && !offering.current) return false;
          pending.current = null;
          showChips([]);
          await respond(copy.replyNotSent, gen, false);
          return true;
        case 'reply': {
          const thread = target.current;
          if (!thread || !mayUseMessages()) return false;
          pending.current = { thread, text: intent.text };
          showChips([
            { kind: 'send', label: copy.send },
            { kind: 'notNow', label: copy.notNow },
          ]);
          await respond(copy.confirmReply(intent.text, threadName(thread)), gen);
          return true;
        }
        case 'reminder': {
          pending.current = null;
          showChips([]);
          if (!mayUseReminders()) {
            await respond(copy.remindersOff, gen);
            return true;
          }
          if (!intent.trigger) {
            await respond(copy.reminderWhen, gen);
            return true;
          }
          let saved;
          try {
            saved = await saveReminder(intent);
          } catch {
            await respond(copy.reminderFailed, gen);
            return true;
          }
          if (gen !== generation.current) return true;
          setCard({ clientUuid: saved.clientUuid, title: saved.title, when: saved.when });
          showChips([{ kind: 'edit', label: copy.edit, reminder: saved.clientUuid }]);
          await respond(saved.spoken, gen);
          return true;
        }
        case 'read':
          pending.current = null;
          showChips([]);
          await readMissed(intent.name, gen);
          return true;
      }
    },
    [readMissed, respond, showChips],
  );

  const ask = useCallback(
    async (question: string, gen: number) => {
      setHeard(question);
      setAnswer('');
      setCard(null);
      setPhase('thinking');
      const intent = parseIntent(question);
      if (intent && (await act(intent, gen))) return;
      if (gen !== generation.current) return;
      // A question for the chat: a reply waiting for "Send" is dropped.
      pending.current = null;
      showChips([]);
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
      await afterSpeaking(gen, !outcome.error);
    },
    [act, afterSpeaking, say, showChips],
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

  /** A chip under the answer, as if it had been said. `edit` is the screen's to open. */
  const choose = useCallback(
    (chip: VoiceChip) => {
      if (chip.kind === 'edit') return;
      const gen = ++generation.current;
      silence();
      setNotice(null);
      setPhase('thinking');
      if (chip.kind === 'say') {
        setHeard(chip.text);
        void act({ kind: 'reply', text: chip.text }, gen);
      } else {
        void act({ kind: chip.kind === 'send' ? 'confirm' : 'decline' }, gen);
      }
    },
    [act, silence],
  );

  /**
   * Reply by voice (4.4): reads the chat's unread messages out, offers a drafted reply and listens
   * for "Reply …". Resolves false when it can't (not the Owner, not ready, the chat is gone): the
   * screen then just listens.
   */
  const replyTo = useCallback(
    async (key: string): Promise<boolean> => {
      if (!ready || !mayUseMessages()) return false;
      const gen = ++generation.current;
      silence();
      setNotice(null);
      setPhase('thinking');
      const opened = await openThread(key);
      if (gen !== generation.current) return true;
      if (!opened) return false;
      target.current = opened.thread;
      void offerDraft(opened.thread, opened.recent);
      if (opened.unread.length === 0) {
        void start(false);
        return true;
      }
      await markHeard(opened.unread);
      await respond(readOut(opened.unread), gen);
      return true;
    },
    [offerDraft, ready, respond, silence, start],
  );

  useEffect(() => {
    speaker.current = createSpeaker();
    return () => {
      generation.current += 1;
      current.current?.cancel();
      work.current?.abort();
      drafting.current?.abort();
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
    chips,
    card,
    chatUuid: chat.chatUuid,
    start: () => start(false),
    pause,
    toggleMic,
    toggleMute,
    choose,
    replyTo,
  };
}
