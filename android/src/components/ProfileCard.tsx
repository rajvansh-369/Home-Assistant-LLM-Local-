import { Lock, User } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, iconSizes, radii, sizes, strokes, type ProfileColor } from '@/theme';

import { Avatar } from './Avatar';
import { Text } from './Text';

type ProfileCardProps = {
  name: string;
  /** Under the name: the role ("Owner") or, for Guest, "Nothing is saved". */
  note: string;
  onPress: () => void;
  /** A profile with a PIN: coloured avatar and a lock beside the role. */
  color?: ProfileColor;
  /** Guest: a dashed card and a dashed person circle. */
  guest?: boolean;
  /** Read after the name and note, e.g. "Locked. Opens with a PIN." */
  hint?: string;
  disabled?: boolean;
};

/** 2.1 Who's using: one profile in the two-column grid. */
export function ProfileCard({
  name,
  note,
  onPress,
  color = 'mint',
  guest = false,
  hint,
  disabled,
}: ProfileCardProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${note}`}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.card,
        guest ? styles.guestCard : styles.profileCard,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {guest ? (
        <View
          style={styles.guestAvatar}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <User size={iconSizes.guestCard} color={colors.textMuted} strokeWidth={strokes.icon} />
        </View>
      ) : (
        <Avatar color={color} name={name} size="card" />
      )}
      <Text variant="cardName" numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.noteRow}>
        {guest ? null : (
          <Lock size={iconSizes.roleLock} color={colors.textMuted} strokeWidth={strokes.icon} />
        )}
        <Text variant="helper" tone="muted" numberOfLines={1}>
          {note}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
    paddingTop: 22,
    paddingBottom: 18,
    paddingHorizontal: 12,
    borderRadius: radii.card,
  },
  profileCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  guestCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.transparent,
  },
  pressed: { backgroundColor: colors.surface2 },
  disabled: { opacity: 0.5 },
  guestAvatar: {
    width: sizes.profileAvatar,
    height: sizes.profileAvatar,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
