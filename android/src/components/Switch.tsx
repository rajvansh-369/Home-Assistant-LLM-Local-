import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, hitSlopFor, motion, radii, sizes } from '@/theme';

const KNOB_TRAVEL = sizes.switchWidth - 2 - sizes.switchPadding * 2 - sizes.switchKnob;

type SwitchTrackProps = { value: boolean; disabled?: boolean };

/** The visual switch only. ToggleRow uses it inside a row that owns the accessibility. */
export function SwitchTrack({ value, disabled = false }: SwitchTrackProps) {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(value ? KNOB_TRAVEL : 0);

  useEffect(() => {
    const target = value ? KNOB_TRAVEL : 0;
    offset.value = reduceMotion ? target : withTiming(target, { duration: motion.switchKnobMs });
  }, [value, offset, reduceMotion]);

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  return (
    <View style={[styles.track, value ? styles.trackOn : styles.trackOff, disabled && styles.disabled]}>
      <Animated.View style={[styles.knob, value ? styles.knobOn : styles.knobOff, knobStyle]} />
    </View>
  );
}

type SwitchProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Screen-reader label, usually the row title. */
  label: string;
  disabled?: boolean;
};

export function Switch({ value, onValueChange, label, disabled = false }: SwitchProps) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={hitSlopFor(sizes.switchHeight)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
    >
      <SwitchTrack value={value} disabled={disabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: sizes.switchWidth,
    height: sizes.switchHeight,
    padding: sizes.switchPadding,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  trackOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  trackOff: { backgroundColor: colors.track, borderColor: colors.borderStrong },
  disabled: { opacity: 0.4 },
  knob: { width: sizes.switchKnob, height: sizes.switchKnob, borderRadius: radii.pill },
  knobOn: { backgroundColor: colors.bg },
  knobOff: { backgroundColor: colors.textMuted },
});
