import Svg, { Circle, Path } from 'react-native-svg';

import { colors, sizes } from '@/theme';

// The canvas pin (§4.4): a 22×30 teardrop anchored at its tip, with a dot at (11, 11).
const TEARDROP = 'M11 30 C5 22 0 17 0 11 A11 11 0 0 1 22 11 C22 17 17 22 11 30 Z';

/** Decorative; the map carries the label. */
export function HomePin() {
  return (
    <Svg
      width={sizes.homePinWidth}
      height={sizes.homePinHeight}
      viewBox="0 0 22 30"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={TEARDROP} fill={colors.accent} />
      <Circle cx={11} cy={11} r={sizes.homePinDotRadius} fill={colors.bg} />
    </Svg>
  );
}
