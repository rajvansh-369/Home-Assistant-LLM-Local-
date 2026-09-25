import type { TextStyle } from 'react-native';

import { fonts } from './fonts';

type TextVariantStyle = Pick<
  TextStyle,
  'fontFamily' | 'fontSize' | 'lineHeight' | 'letterSpacing' | 'textTransform' | 'includeFontPadding'
>;

const style = (
  fontFamily: string,
  fontSize: number,
  lineHeight: number,
  letterSpacing = 0,
  extra: Partial<TextVariantStyle> = {},
): TextVariantStyle => ({
  fontFamily,
  fontSize,
  lineHeight,
  letterSpacing,
  includeFontPadding: false,
  ...extra,
});

// Plan §2 Typography. px line heights and letter spacing, one fontFamily per weight.
export const typography = {
  display: style(fonts.display700, 35, 38, -0.7),
  title: style(fonts.display700, 30, 33, -0.45),
  name: style(fonts.display700, 26, 36, -0.26),
  wordmark: style(fonts.display700, 20, 28, -0.2),
  avatar: style(fonts.display700, 36, 44),
  avatarSmall: style(fonts.display700, 35, 42),
  key: style(fonts.display600, 26, 32),
  body: style(fonts.body400, 15, 22),
  bodySmall: style(fonts.body400, 14, 20),
  rowTitle: style(fonts.body700, 15, 22),
  rowTitleToggle: style(fonts.body600, 15, 22),
  label: style(fonts.body700, 13, 18),
  helper: style(fonts.body400, 13, 18),
  status: style(fonts.body600, 13, 18),
  button: style(fonts.body700, 16, 22),
  /** 2.2 "Enter your PIN": Manrope 16 (weight not given on the canvas; 400 assumed). */
  prompt: style(fonts.body400, 16, 22),
  /** 2.2 message line when the PIN is accepted. */
  statusStrong: style(fonts.body700, 13, 20),
  /** 2.2 message line while typing (20 px line). */
  hint: style(fonts.body400, 13, 20),
  link: style(fonts.body700, 14, 20),
  chip: style(fonts.body700, 13, 18),
  mono: style(fonts.mono400, 15, 22),
  monoSmall: style(fonts.mono500, 12, 16),
  pin: style(fonts.mono400, 22, 28, 8.8),
  badge: style(fonts.mono600, 10, 12, 0.6, { textTransform: 'uppercase' }),
} as const satisfies Record<string, TextVariantStyle>;

export type TextVariant = keyof typeof typography;

// Variants whose layout breaks at large system font sizes (§2), plus the glyphs drawn inside
// fixed shapes: the avatar initial (84 circle) and the keypad digits (64 keys).
export const cappedVariants: readonly TextVariant[] = [
  'display',
  'title',
  'button',
  'avatar',
  'avatarSmall',
  'key',
];
export const maxFontSizeMultiplier = 1.3;
