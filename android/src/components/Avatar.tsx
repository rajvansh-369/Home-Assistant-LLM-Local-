import { StyleSheet, View } from 'react-native';

import { profileColors, radii, sizes, type ProfileColor } from '@/theme';

import { Text } from './Text';

type AvatarProps = {
  color: ProfileColor;
  /** The profile name; only its first letter is shown. */
  name: string;
  /** 2.2 draws the letter at 35 instead of 36. */
  small?: boolean;
};

export function Avatar({ color, name, small = false }: AvatarProps) {
  const initial = name.trim().charAt(0).toLocaleUpperCase();
  return (
    <View
      style={[styles.avatar, { backgroundColor: profileColors[color] }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {initial ? (
        <Text variant={small ? 'avatarSmall' : 'avatar'} tone="onAccent">
          {initial}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: sizes.avatar,
    height: sizes.avatar,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
