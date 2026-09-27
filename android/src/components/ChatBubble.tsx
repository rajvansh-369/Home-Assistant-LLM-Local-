import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/theme';

import { Text } from './Text';

/** 3.4: what the person asked, right-aligned on the `track` fill. */
export function ChatBubble({ text }: { text: string }) {
  return (
    <View style={styles.bubble}>
      <Text variant="body" selectable>
        {text}
      </Text>
    </View>
  );
}

/** "Today" between days of a chat. */
export function DateDivider({ label }: { label: string }) {
  return (
    <Text variant="caps" tone="muted" style={styles.divider} accessibilityRole="header">
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    backgroundColor: colors.track,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopLeftRadius: radii.bubble,
    borderTopRightRadius: radii.bubble,
    borderBottomLeftRadius: radii.bubble,
    borderBottomRightRadius: radii.bubbleTail,
  },
  divider: { alignSelf: 'center' },
});
