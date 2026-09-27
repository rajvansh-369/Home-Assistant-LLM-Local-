// The little Markdown the models write (docs/aster-home-chat-plan.md §4.7): paragraphs, bullet and
// numbered lists, headings, **bold**, *italic* and `code`. Pure; unclosed marks while an answer is
// still streaming stay as text until they close.

export type Inline = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

export type Block =
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'heading'; inlines: Inline[] }
  | { kind: 'bullet'; inlines: Inline[]; depth: number }
  | { kind: 'numbered'; n: string; inlines: Inline[]; depth: number };

const TOKEN = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    const token = match[0];
    if (token.startsWith('**') || token.startsWith('__'))
      out.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith('`')) out.push({ text: token.slice(1, -1), code: true });
    else out.push({ text: token.slice(1, -1), italic: true });
    last = at + token.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };

  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();
    const depth = indent >= 2 ? 1 : 0;
    let match: RegExpExecArray | null;
    if (line === '') {
      flush();
    } else if ((match = /^#{1,6}\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ kind: 'heading', inlines: parseInline(match[1].replace(/\s*#+$/, '')) });
    } else if ((match = /^[-*+•]\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ kind: 'bullet', inlines: parseInline(match[1]), depth });
    } else if ((match = /^(\d{1,3})[.)]\s+(.*)$/.exec(line))) {
      flush();
      blocks.push({ kind: 'numbered', n: match[1], inlines: parseInline(match[2]), depth });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
