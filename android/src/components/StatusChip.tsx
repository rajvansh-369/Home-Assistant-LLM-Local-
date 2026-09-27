import type { LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, hitSlopFor, iconSizes, motion, radii, sizes, strokes } from '@/theme';

import { Text } from './Text';

export type StatusTone = 'ready' | 'busy' | 'off';

const DOT = { ready: colors.accent, busy: colors.warning, off: colors.textMuted } as const;

/** The canvas pulse: grows to 2.6× and fades out by 70 % of 2.2 s, then waits. */
function PulseDot({ tone }: { tone: StatusTone }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const pulsing = tone !== 'off' && !reduced;

  useEffect(() => {
    if (!pulsing) {
      progress.value = 0;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: motion.pulseMs, easing: Easing.out(Easing.quad) }),
      -1,
    );
  }, [pulsing, progress]);

  const ring = useAnimatedStyle(() => {
    const t = Math.min(progress.value / 0.7, 1);
    return {
      opacity: pulsing ? 0.85 * (1 - t) : 0,
      transform: [{ scale: 1 + (motion.pulseScale - 1) * t }],
    };
  });

  return (
    <View
      style={styles.dotBox}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View style={[styles.dot, { backgroundColor: DOT[tone] }]} />
      <Animated.View style={[styles.dot, styles.ring, { backgroundColor: DOT[tone] }, ring]} />
    </View>
  );
}

type StatusChipProps = {
  label: string;
  tone: StatusTone;
  /** 3.1 draws a House icon instead of the dot. */
  icon?: LucideIcon;
  onPress?: () => void;
};

/** "At home · zephyr-7b ready" on 2.1 and 3.1: a mono label with a pulsing dot. */
export function StatusChip({ label, tone, icon: Icon, onPress }: StatusChipProps) {
  const content = (
    <>
      {Icon ? (
        <Icon size={iconSizes.chip} color={DOT[tone]} strokeWidth={strokes.icon} />
      ) : (
        <PulseDot tone={tone} />
      )}
      <Text variant="monoSmall" tone="secondary" numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  if (!onPress) {
    return (
      <View
        style={styles.chip}
        accessible
        accessibilityRole="text"
        accessibilityLabel={label}
        accessibilityLiveRegion="polite"
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlopFor(sizes.statusChip)}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: sizes.statusChip,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
  },
  pressed: { backgroundColor: colors.surface2 },
  dotBox: { width: sizes.statusDot, height: sizes.statusDot },
  dot: {
    position: 'absolute',
    width: sizes.statusDot,
    height: sizes.statusDot,
    borderRadius: radii.pill,
  },
  ring: { opacity: 0 },
});
