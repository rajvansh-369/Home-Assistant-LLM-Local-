import { ChevronLeft } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { common } from '@/features/first-run/copy';
import { colors, iconSizes, motion, radii, sizes, spacing, strokes } from '@/theme';

import { Text } from './Text';

const TOTAL_STEPS = 4;

type BackButtonProps = { onPress: () => void };

export function BackButton({ onPress }: BackButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={common.back}
      style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
    >
      <ChevronLeft size={iconSizes.back} color={colors.text} strokeWidth={strokes.icon} />
    </Pressable>
  );
}

type StepHeaderProps = {
  step: number;
  onBack?: () => void;
};

export function StepHeader({ step, onBack }: StepHeaderProps) {
  return (
    <View>
      <View style={styles.row}>
        {onBack ? <BackButton onPress={onBack} /> : <View style={styles.back} />}
        <Text variant="monoSmall" tone="muted" style={styles.stepLabel}>
          {common.stepOf(step, TOTAL_STEPS)}
        </Text>
      </View>
      <ProgressSegments step={step} />
    </View>
  );
}

type ProgressSegmentsProps = { step: number; total?: number };

export function ProgressSegments({ step, total = TOTAL_STEPS }: ProgressSegmentsProps) {
  return (
    <View
      style={styles.segments}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={common.stepOf(step, total)}
      accessibilityValue={{ min: 0, max: total, now: step }}
    >
      {Array.from({ length: total }, (_, i) => (
        <Segment key={i} filled={i < step} />
      ))}
    </View>
  );
}

function Segment({ filled }: { filled: boolean }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    const target = filled ? 1 : 0;
    progress.value = reduceMotion ? target : withTiming(target, { duration: motion.progressFillMs });
  }, [filled, progress, reduceMotion]);

  const animated = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.track, colors.accent]),
  }));

  return <Animated.View style={[styles.segment, animated]} />;
}

const styles = StyleSheet.create({
  row: {
    height: sizes.header,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    width: sizes.backButton,
    height: sizes.backButton,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPressed: { backgroundColor: colors.surface },
  stepLabel: { paddingRight: 12 },
  segments: {
    flexDirection: 'row',
    gap: sizes.progressGap,
    paddingHorizontal: spacing.screenX,
  },
  segment: { flex: 1, height: sizes.progressHeight, borderRadius: radii.pill },
});
