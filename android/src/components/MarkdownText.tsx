// An answer's text with its Markdown drawn (features/chat/markdown.ts): lists as rows with a bullet
// or a mono number in the accent (as on 2.5), headings and bold in Manrope 700, code in mono.
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { parseMarkdown, type Inline } from '@/features/chat/markdown';
import { colors, fonts, spacing } from '@/theme';

import { Text } from './Text';

function Spans({ inlines }: { inlines: Inline[] }) {
  return inlines.map((inline, index) => (
    <Text
      key={index}
      variant="message"
      style={inline.code ? styles.code : inline.bold ? styles.bold : undefined}
    >
      {inline.text}
    </Text>
  ));
}

export function MarkdownText({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <View style={styles.column}>
      {blocks.map((block, index) => {
        if (block.kind === 'paragraph' || block.kind === 'heading') {
          return (
            <Text
              key={index}
              variant="message"
              selectable
              style={block.kind === 'heading' ? styles.bold : undefined}
              accessibilityRole={block.kind === 'heading' ? 'header' : undefined}
            >
              <Spans inlines={block.inlines} />
            </Text>
          );
        }
        return (
          <View key={index} style={[styles.item, block.depth > 0 && styles.nested]}>
            <Text
              variant={block.kind === 'numbered' ? 'monoSmall' : 'message'}
              tone={block.kind === 'numbered' ? 'accent' : 'secondary'}
              style={block.kind === 'numbered' ? styles.number : styles.bullet}
            >
              {block.kind === 'numbered' ? block.n : '•'}
            </Text>
            <Text variant="message" selectable style={styles.flex}>
              <Spans inlines={block.inlines} />
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: spacing.chipGap },
  flex: { flex: 1 },
  item: { flexDirection: 'row', gap: 10 },
  nested: { paddingLeft: 18 },
  bullet: { width: 10 },
  number: { minWidth: 14, paddingTop: 4 },
  bold: { fontFamily: fonts.body700 },
  code: { fontFamily: fonts.mono400, color: colors.textSecondary },
});
