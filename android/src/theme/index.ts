import { colors, mapColors, orbColors, profileColors } from './colors';
import { fonts } from './fonts';
import { mapStyle } from './mapStyle';
import { motion } from './motion';
import { iconSizes, radii, sizes, spacing, strokes } from './spacing';
import { typography } from './typography';

export { colors, mapColors, orbColors, profileColors } from './colors';
export type { ColorToken, ProfileColor } from './colors';
export { fontAssets, fonts } from './fonts';
export { mapStyle } from './mapStyle';
export { motion } from './motion';
export { hitSlopFor, iconSizes, radii, sizes, spacing, strokes } from './spacing';
export { cappedVariants, maxFontSizeMultiplier, typography } from './typography';
export type { TextVariant } from './typography';

export const theme = {
  colors,
  profileColors,
  orbColors,
  mapColors,
  fonts,
  typography,
  spacing,
  sizes,
  iconSizes,
  strokes,
  radii,
  motion,
  mapStyle,
} as const;

export type Theme = typeof theme;
