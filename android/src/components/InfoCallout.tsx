import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { colors, iconSizes, radii, strokes } from '@/theme';

import { Text } from './Text';

/** `accent` (1.2, 5.1), `warning` (3.1 loading banner) or `neutral` (2.5 Guest callout). */
export type CalloutTone = 'accent' | 'warning' | 'neutral';

const TONES = {
  accent: { icon: colors.accent, border: colors.accentBorder, fill: colors.accentTint },
  warning: { icon: colors.warning, border: colors.warningBorder, fill: colors.warningTint },
  neutral: { icon: colors.textSecondary, border: colors.border, fill: colors.surface },
} as const;

type InfoCalloutProps = { icon: LucideIcon; text: string; tone?: CalloutTone; live?: boolean };

export function InfoCallout({ icon: Icon, text, tone = 'accent', live = false }: InfoCalloutProps) {
  const colours = TONES[tone];
  return (
    <View
      style={[styles.callout, { borderColor: colours.border, backgroundColor: colours.fill }]}
      accessibilityLiveRegion={live ? 'polite' : undefined}
    >
      <Icon size={iconSizes.callout} color={colours.icon} strokeWidth={strokes.icon} />
      <Text
        variant="bodySmall"
        tone={tone === 'neutral' ? 'secondary' : 'primary'}
        style={styles.text}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  callout: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.callout,
    borderWidth: 1,
  },
  text: { flex: 1 },
});
