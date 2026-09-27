import { errorText } from '@/features/chat/useChat';
import { parseInline, parseMarkdown } from '@/features/chat/markdown';
import { activeEngineOf } from '@/features/first-run/store';
import { ChatError } from '@/services/llm/chat';

describe('parseMarkdown', () => {
  test('paragraphs, bullets, numbers and headings', () => {
    const blocks = parseMarkdown(
      [
        'Here is a plan:',
        '',
        '## Morning',
        '* **07:00** — Wake up',
        '- Coffee',
        '  - nested',
        '1. First',
        '2) Second',
        '',
        'Want more?',
      ].join('\n'),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'paragraph',
      'heading',
      'bullet',
      'bullet',
      'bullet',
      'numbered',
      'numbered',
      'paragraph',
    ]);
    expect(blocks[2]).toEqual({
      kind: 'bullet',
      depth: 0,
      inlines: [{ text: '07:00', bold: true }, { text: ' — Wake up' }],
    });
    expect(blocks[4]).toMatchObject({ kind: 'bullet', depth: 1 });
    expect(blocks[6]).toMatchObject({ kind: 'numbered', n: '2' });
  });

  test('lines of one paragraph stay together', () => {
    expect(parseMarkdown('one\ntwo')).toEqual([
      { kind: 'paragraph', inlines: [{ text: 'one\ntwo' }] },
    ]);
  });

  test('bold, italic and code; an unclosed mark stays text while streaming', () => {
    expect(parseInline('a **b** _c_ `d`')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' ' },
      { text: 'd', code: true },
    ]);
    expect(parseInline('half **bol')).toEqual([{ text: 'half **bol' }]);
    expect(parseInline('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4' }]);
  });
});

test('Guest answers with its own engine; everyone else with the phone choice', () => {
  const profile = {
    id: 1,
    name: 'G',
    color: '#9299A1',
    role: 'guest' as const,
    llm_engine: 'local' as const,
  };
  const session = { profileToken: 'p', llmToken: 'l', expiresAt: '2099-01-01T00:00:00Z', profile };
  expect(activeEngineOf({ session, llmEngine: 'markl' })).toBe('local');
  expect(
    activeEngineOf({
      session: { ...session, profile: { ...profile, role: 'member' } },
      llmEngine: 'markl',
    }),
  ).toBe('markl');
  expect(activeEngineOf({ session: null, llmEngine: 'markl' })).toBe('markl');
});

test("a model that is off says so; one that's loading gets the loading line", () => {
  expect(errorText(new ChatError('not-ready', 'model is still loading', 503), 'Mark-L')).toBe(
    'Model is loading. Try again in a moment.',
  );
  expect(
    errorText(
      new ChatError('not-ready', 'the local model is switched off (ZYPHER_LOCAL_MODEL=off)', 503),
      'Local',
    ),
  ).toBe('the local model is switched off (ZYPHER_LOCAL_MODEL=off)');
  expect(errorText(new ChatError('quota', 'x', 429), 'Jarvis')).toBe(
    'Jarvis is out of quota for now. Switch to Local in Settings.',
  );
});
