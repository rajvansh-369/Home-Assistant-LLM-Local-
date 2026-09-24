import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

type ScreenProps = {
  /** Fixed above the scrolling content, e.g. StepHeader. */
  header?: ReactNode;
  children: ReactNode;
  /** Pinned to the bottom on tall phones, scrolls into view on short ones. */
  footer?: ReactNode;
  /** Gap between content blocks (18 on 1.2 and 1.5, 20 on 1.3). */
  gap?: number;
  footerGap?: number;
  /** Welcome uses 24 sides, 8 top and 28 bottom. */
  variant?: 'default' | 'welcome';
  contentStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  header,
  children,
  footer,
  gap = spacing.gapSignIn,
  footerGap = spacing.footerGap,
  variant = 'default',
  contentStyle,
}: ScreenProps) {
  const padding = variant === 'welcome' ? styles.welcomePadding : styles.defaultPadding;
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      {header}
      <KeyboardAwareScrollView
        style={styles.root}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bottomOffset={spacing.contentBottom}
      >
        <View style={[styles.column, padding, { gap }, contentStyle]}>
          {children}
          {footer ? <View style={[styles.footer, { gap: footerGap }]}>{footer}</View> : null}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { flexGrow: 1 },
  column: { flexGrow: 1 },
  defaultPadding: {
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.contentTop,
    paddingBottom: spacing.contentBottom,
  },
  welcomePadding: {
    paddingHorizontal: spacing.welcomeX,
    paddingTop: spacing.welcomeTop,
    paddingBottom: spacing.welcomeBottom,
  },
  // The canvas's `margin-top: auto`.
  footer: { marginTop: 'auto' },
});
