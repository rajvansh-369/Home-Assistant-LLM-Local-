import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold';
import { Manrope_400Regular } from '@expo-google-fonts/manrope/400Regular';
import { Manrope_600SemiBold } from '@expo-google-fonts/manrope/600SemiBold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';

// On Android each weight is its own family: set fontFamily per weight, never fontWeight.
export const fonts = {
  display600: 'BricolageGrotesque_600SemiBold',
  display700: 'BricolageGrotesque_700Bold',
  body400: 'Manrope_400Regular',
  body600: 'Manrope_600SemiBold',
  body700: 'Manrope_700Bold',
  mono400: 'JetBrainsMono_400Regular',
  mono500: 'JetBrainsMono_500Medium',
  mono600: 'JetBrainsMono_600SemiBold',
} as const;

export const fontAssets = {
  [fonts.display600]: BricolageGrotesque_600SemiBold,
  [fonts.display700]: BricolageGrotesque_700Bold,
  [fonts.body400]: Manrope_400Regular,
  [fonts.body600]: Manrope_600SemiBold,
  [fonts.body700]: Manrope_700Bold,
  [fonts.mono400]: JetBrainsMono_400Regular,
  [fonts.mono500]: JetBrainsMono_500Medium,
  [fonts.mono600]: JetBrainsMono_600SemiBold,
};
