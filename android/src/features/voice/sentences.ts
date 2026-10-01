// Answers read aloud as they stream (docs/aster-voice-plan.md §4 Speaking): the stream is cut
// into sentences at `.`, `?` or `!` followed by a space, at line breaks (list items, paragraphs),
// or at MAX_SENTENCE characters, and each sentence loses its Markdown before it is spoken.

export const MAX_SENTENCE = 200;

/** Markdown and links out, so TTS doesn't read "asterisk" or a URL. Empty if nothing is left. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)(?=\S)([^*_~]+?)\1/g, '$2')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Where the first complete sentence of `text` ends, or -1. */
function sentenceEnd(text: string): number {
  // A code block is never cut inside: text before it is cut as usual, then the whole block goes
  // as one piece once it closes (speakable drops it).
  const fence = text.indexOf('```');
  const head = fence >= 0 ? text.slice(0, fence) : text;
  const newline = head.indexOf('\n');
  const stop = /[.?!…]["')\]]?(?=\s)/.exec(head);
  const ends = [newline, stop ? stop.index + stop[0].length : -1].filter((i) => i >= 0);
  if (ends.length > 0) return Math.min(...ends);
  if (fence >= 0) {
    if (fence > 0) return fence;
    const close = text.indexOf('```', 3);
    return close < 0 ? -1 : close + 3;
  }
  if (text.length > MAX_SENTENCE) {
    const space = text.lastIndexOf(' ', MAX_SENTENCE);
    return space > 0 ? space : MAX_SENTENCE;
  }
  return -1;
}

/**
 * Feeds streamed text in; gets speakable sentences out as soon as they are complete. `flush` gives
 * whatever is left when the stream ends.
 */
export function createSentenceSplitter() {
  let buffer = '';

  function take(): string[] {
    const out: string[] = [];
    for (;;) {
      const end = sentenceEnd(buffer);
      if (end < 0) return out;
      const sentence = speakable(buffer.slice(0, end));
      buffer = buffer.slice(end).replace(/^\s+/, '');
      if (sentence) out.push(sentence);
    }
  }

  return {
    push(chunk: string): string[] {
      buffer += chunk;
      return take();
    },
    flush(): string[] {
      const out = take();
      const rest = speakable(buffer);
      buffer = '';
      return rest ? [...out, rest] : out;
    },
  };
}
