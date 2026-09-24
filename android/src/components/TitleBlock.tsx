import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing } from '@/theme';

import { Text } from './Text';

type TitleBlockProps = {
  title: string;
  subtitle?: string;
  /** 8 by default, 6 on 1.4. */
  gap?: number;
  style?: StyleProp<ViewStyle>;
};

export function TitleBlock({ title, subtitle, gap = spacing.titleGap, style }: TitleBlockProps) {
  return (
    <View style={[styles.block, { gap }, style]}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" tone="secondary">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { alignSelf: 'stretch' },
});
