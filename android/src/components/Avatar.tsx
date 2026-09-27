import { StyleSheet, View } from 'react-native';

import { profileColors, radii, sizes, type ProfileColor, type TextVariant } from '@/theme';

import { Text } from './Text';

/** 84 on 1.3 and 2.2, 72 on the 2.1 cards, 46 in the 3.1 header. */
export type AvatarSize = 'large' | 'card' | 'header';

const DIAMETER: Record<AvatarSize, number> = {
  large: sizes.avatar,
  card: sizes.profileAvatar,
  header: sizes.homeAvatar,
};

const LETTER: Record<AvatarSize, TextVariant> = {
  large: 'avatar',
  card: 'avatarMedium',
  header: 'avatarTiny',
};

type AvatarProps = {
  color: ProfileColor;
  /** The profile name; only its first letter is shown. */
  name: string;
  /** 2.2 draws the letter at 35 instead of 36. */
  small?: boolean;
  size?: AvatarSize;
};

export function Avatar({ color, name, small = false, size = 'large' }: AvatarProps) {
  const initial = name.trim().charAt(0).toLocaleUpperCase();
  const diameter = DIAMETER[size];
  const variant = size === 'large' && small ? 'avatarSmall' : LETTER[size];
  return (
    <View
      style={[
        styles.avatar,
        { width: diameter, height: diameter, backgroundColor: profileColors[color] },
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {initial ? (
        <Text variant={variant} tone="onAccent">
          {initial}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
