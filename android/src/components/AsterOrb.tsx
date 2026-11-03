import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { motion, orbColors, radii, sizes } from '@/theme';

import { OrbSphere } from './OrbSphere';

const coreStops = [
  { offset: 0, color: orbColors.coreStart },
  { offset: 0.38, color: orbColors.mid },
  { offset: 1, color: orbColors.end },
] as const;

type AsterOrbProps = {
  /** Box size, at most 190. Welcome fits it to the free height. Parts scale with it. */
  size?: number;
  /** The static (reduced-motion) look: the gallery, and 3.6 while paused. */
  still?: boolean;
  /** `voice`: 3.6's larger orb (230 box, 106 core); `size` is ignored. */
  variant?: 'welcome' | 'voice';
};

export function AsterOrb({ size = sizes.orb, still = false, variant = 'welcome' }: AsterOrbProps) {
  const isVoice = variant === 'voice';
  const box = isVoice ? sizes.voiceOrb : Math.min(size, sizes.orb);
  const scale = isVoice ? 1 : box / sizes.orb;
  const core = isVoice ? sizes.voiceOrbCore : sizes.orbCore * scale;
  const inset = isVoice ? sizes.voiceOrbInset : sizes.orbInnerInset * scale;

  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion && !still;

  // 0 → 1 over one ring cycle; the ring's scale and opacity both follow it.
  const ring = useSharedValue(0);
  const coreScale = useSharedValue(1);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(ring);
      cancelAnimation(coreScale);
      ring.value = 0;
      coreScale.value = 1;
      return;
    }
    ring.value = withRepeat(
      withTiming(1, { duration: motion.orbRingMs, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    const half = { duration: motion.orbCoreMs / 2, easing: Easing.inOut(Easing.ease) };
    coreScale.value = withRepeat(
      withSequence(withTiming(motion.orbCoreScale, half), withTiming(1, half)),
      -1,
      false,
    );
    return () => {
      cancelAnimation(ring);
      cancelAnimation(coreScale);
    };
  }, [animate, ring, coreScale]);

  const ringStyle = useAnimatedStyle(() => {
    const from = motion.orbRingScaleFrom;
    const to = motion.orbRingScaleTo;
    return {
      opacity: motion.orbRingOpacityFrom * (1 - ring.value),
      transform: [{ scale: from + (to - from) * ring.value }],
    };
  });

  const coreStyle = useAnimatedStyle(() => ({ transform: [{ scale: coreScale.value }] }));

  const circle = (d: number) => ({ width: d, height: d, borderRadius: radii.pill });

  return (
    <View
      style={[styles.box, circle(box)]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <View style={[styles.layer, styles.outerRing, circle(box)]} />
      <View style={[styles.layer, styles.innerRing, circle(box - inset * 2)]} />
      {animate ? <Animated.View style={[styles.layer, styles.pulseRing, circle(core), ringStyle]} /> : null}
      <Animated.View
        style={[styles.layer, isVoice ? styles.voiceGlow : styles.glow, circle(core), coreStyle]}
      >
        <OrbSphere size={core} cx={0.34} cy={0.3} stops={coreStops} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute' },
  outerRing: { borderWidth: 1, borderColor: orbColors.outerRing },
  innerRing: { borderWidth: 1, borderColor: orbColors.innerRing },
  pulseRing: { borderWidth: sizes.orbPulseBorder, borderColor: orbColors.pulseRing },
  glow: { boxShadow: `0 0 57px ${orbColors.coreGlow}` },
  voiceGlow: { boxShadow: `0 0 69px ${orbColors.coreGlow}` },
});
