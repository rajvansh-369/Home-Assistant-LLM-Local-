import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { sizes, spacing } from '@/theme';

import { BackButton } from './StepHeader';
import { Text } from './Text';

type ScreenHeaderProps = {
  title: string;
  /** 3.4: "zephyr-7b · home server", in mono. */
  subtitle?: string;
  onBack?: () => void;
  /** Trailing actions, e.g. IconButtons. */
  children?: ReactNode;
  /** 3.3 draws its title large ("Chats"). */
  large?: boolean;
  /** Replaces the back button, e.g. the Guest avatar on 2.5. */
  leading?: ReactNode;
};

/** The 60 tall header of 3.3 and 3.4. */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  children,
  large = false,
  leading,
}: ScreenHeaderProps) {
  return (
    <View style={[styles.header, !onBack && !leading && styles.noBack]}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      {leading}
      <View style={styles.titles}>
        <Text
          variant={large ? 'heading' : 'headerTitle'}
          accessibilityRole="header"
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant="monoSmall" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: sizes.screenHeader,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.headerX,
    gap: 4,
  },
  noBack: { paddingLeft: spacing.screenX },
  titles: { flex: 1, minWidth: 0, gap: 1 },
  actions: { flexDirection: 'row', alignItems: 'center' },
});
