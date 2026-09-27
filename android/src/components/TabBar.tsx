import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { House, MessageCircle, SlidersHorizontal, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { tabs as copy } from '@/features/home/copy';
import { colors, iconSizes, radii, sizes, strokes } from '@/theme';

import { Text } from './Text';

/** Route name (inside `(tabs)`) to its label and icon (canvas nav). */
export const TAB_ITEMS: Record<string, { label: string; icon: LucideIcon }> = {
  home: { label: copy.home, icon: House },
  chats: { label: copy.chats, icon: MessageCircle },
  settings: { label: copy.settings, icon: SlidersHorizontal },
};

type TabButtonProps = {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onPress: () => void;
};

export function TabButton({ label, icon: Icon, active, onPress }: TabButtonProps) {
  const tint = active ? colors.accent : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={styles.tab}
    >
      <View style={[styles.pill, active && styles.pillActive]}>
        <Icon size={iconSizes.tab} color={tint} strokeWidth={strokes.icon} />
      </View>
      <Text variant="tab" style={{ color: tint }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The 3.1 bottom navigation, drawn for expo-router's Tabs (`tabBar`). */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={copy.main}
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      {state.routes.map((route, index) => {
        const item = TAB_ITEMS[route.name];
        if (!item) return null;
        const active = state.index === index;
        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!active && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <TabButton
            key={route.key}
            label={item.label}
            icon={item.icon}
            active={active}
            onPress={onPress}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: sizes.tabBar,
    paddingTop: 8,
    paddingHorizontal: 6,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: sizes.touchTarget,
  },
  pill: {
    width: sizes.tabPillWidth,
    height: sizes.tabPillHeight,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: { backgroundColor: colors.accentTint },
});
