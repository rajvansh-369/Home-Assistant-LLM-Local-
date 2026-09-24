import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import {
  cappedVariants,
  colors,
  maxFontSizeMultiplier,
  typography,
  type TextVariant,
} from '@/theme';

export const textTones = {
  primary: colors.text,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  accent: colors.accent,
  warning: colors.warning,
  danger: colors.danger,
  onAccent: colors.bg,
} as const;

export type TextTone = keyof typeof textTones;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
};

export function Text({ variant = 'body', tone = 'primary', style, ...rest }: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={cappedVariants.includes(variant) ? maxFontSizeMultiplier : undefined}
      {...rest}
      style={[typography[variant], { color: textTones[tone] }, style]}
    />
  );
}
