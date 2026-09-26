import { Circle, CircleCheck, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, iconSizes, radii, strokes } from '@/theme';

import { IconTile } from './IconTile';
import { Text } from './Text';

type ChoiceCardProps = {
  icon: LucideIcon;
  title: string;
  /** A short tag beside the title, e.g. "Offline". */
  tag?: string;
  description: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

/** One option of a radio group drawn as cards. Put the cards in a View with role "radiogroup". */
export function ChoiceCard({
  icon,
  title,
  tag,
  description,
  selected,
  onPress,
  disabled = false,
}: ChoiceCardProps) {
  const Mark = selected ? CircleCheck : Circle;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={tag ? `${title}, ${tag}` : title}
      accessibilityHint={description}
      accessibilityState={{ checked: selected, disabled }}
      style={({ pressed }) => [
        styles.card,
        selected ? styles.selected : styles.idle,
        pressed && !selected && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <IconTile icon={icon} size={40} tone={selected ? 'accent' : 'neutral'} />
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <Text variant="rowTitle" style={styles.title}>
            {title}
          </Text>
          {tag ? (
            <View style={[styles.tag, selected && styles.tagSelected]}>
              <Text variant="badge" tone={selected ? 'accent' : 'muted'}>
                {tag}
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="helper" tone="muted">
          {description}
        </Text>
      </View>
      <Mark
        size={iconSizes.choiceMark}
        color={selected ? colors.accent : colors.borderStrong}
        strokeWidth={selected ? strokes.check : strokes.icon}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 14,
    borderRadius: radii.permissionRow,
    borderWidth: 1,
  },
  idle: { borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderColor: colors.accentBorder, backgroundColor: colors.accentTint },
  pressed: { backgroundColor: colors.surface2 },
  disabled: { opacity: 0.4 },
  text: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: { flexShrink: 1 },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radii.badge,
    backgroundColor: colors.surface2,
  },
  tagSelected: { backgroundColor: colors.accentTint },
});
