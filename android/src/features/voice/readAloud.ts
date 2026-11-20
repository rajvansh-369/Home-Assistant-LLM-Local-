// 3.4's "Read aloud" (docs/aster-voice-plan.md §3 3.4): replays an answer to a voice turn with the
// voice and speed of 5.1, one answer at a time. Nothing is logged.
import { create } from 'zustand';

import { createSentenceSplitter } from './sentences';
import { createSpeaker } from './speech';

type ReadAloudStore = { reading: string | null };

/** Which answer (its client_uuid) is being read now. */
export const useReadAloud = create<ReadAloudStore>(() => ({ reading: null }));

let current: ReturnType<typeof createSpeaker> | null = null;

/** Stops whatever is being read. */
export function stopReading() {
  const speaker = current;
  current = null;
  useReadAloud.setState({ reading: null });
  if (speaker) {
    speaker.stop();
    speaker.dispose();
  }
}

/** Reads `text` (Markdown) out as answer `id`, stopping any other. */
export function readAloud(id: string, text: string) {
  stopReading();
  const splitter = createSentenceSplitter();
  const sentences = [...splitter.push(text), ...splitter.flush()];
  if (sentences.length === 0) return;
  let speaker: ReturnType<typeof createSpeaker>;
  try {
    speaker = createSpeaker();
  } catch {
    return; // No native side.
  }
  current = speaker;
  useReadAloud.setState({ reading: id });
  sentences.forEach((sentence) => speaker.say(sentence));
  void speaker.idle().then(() => {
    if (current !== speaker) return;
    current = null;
    speaker.dispose();
    useReadAloud.setState({ reading: null });
  });
}
