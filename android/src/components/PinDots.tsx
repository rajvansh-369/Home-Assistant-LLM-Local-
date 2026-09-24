import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { colors, motion, radii, sizes } from '@/theme';

const PIN_LENGTH = 6;

type PinDotsProps = {
  filled: number;
  /** Change this number to shake the dots once (wrong PIN). */
  shakeKey?: number;
  /** Screen-reader summary, e.g. "3 of 6 digits entered". */
  accessibilityLabel?: string;
};

/** 2.2: six 14 px dots, gap 16. Empty: borderStrong ring. Filled: accent. */
export function PinDots({ filled, shakeKey = 0, accessibilityLabel }: PinDotsProps) {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);

  useEffect(() => {
    if (shakeKey === 0 || reduceMotion) return;
    const d = motion.shakeDistance;
    const step = { duration: motion.shakeStepMs };
    offset.value = withSequence(
      withTiming(-d, step),
      withTiming(d, step),
      withTiming(-d, step),
      withTiming(d, step),
      withTiming(0, step),
    );
  }, [shakeKey, reduceMotion, offset]);

  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <Animated.View
      style={[styles.row, shake]}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <View key={i} style={[styles.dot, i < filled ? styles.filled : styles.empty]} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: sizes.pinDotGap },
  dot: {
    width: sizes.pinDot,
    height: sizes.pinDot,
    borderRadius: radii.pill,
    borderWidth: sizes.pinDotBorder,
  },
  empty: { borderColor: colors.borderStrong, backgroundColor: colors.transparent },
  filled: { borderColor: colors.accent, backgroundColor: colors.accent },
});
