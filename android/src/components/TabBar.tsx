import type { BottomTabBarProps } from 'expo-router/js-tabs';
import {
  House,
  Inbox,
  MessageCircle,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { tabs as copy } from '@/features/home/copy';
import { messages as messagesCopy } from '@/features/messages/copy';
import { colors, iconSizes, radii, sizes, strokes } from '@/theme';

import { CountBadge } from './CountBadge';
import { Text } from './Text';

/** Route name (inside `(tabs)`) to its label and icon (canvas nav). */
export const TAB_ITEMS: Record<string, { label: string; icon: LucideIcon }> = {
  home: { label: copy.home, icon: House },
  chats: { label: copy.chats, icon: MessageCircle },
  messages: { label: messagesCopy.tab, icon: Inbox },
  settings: { label: copy.settings, icon: SlidersHorizontal },
};

type TabButtonProps = {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onPress: () => void;
  /** The canvas's warning count on the icon (Messages: unread VIP messages). */
  badge?: number;
};

export function TabButton({ label, icon: Icon, active, onPress, badge = 0 }: TabButtonProps) {
  const tint = active ? colors.accent : colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={badge > 0 ? copy.withBadge(label, badge) : label}
      accessibilityState={{ selected: active }}
      style={styles.tab}
    >
      <View style={[styles.pill, active && styles.pillActive]}>
        <Icon size={iconSizes.tab} color={tint} strokeWidth={strokes.icon} />
        {badge > 0 ? (
          <View style={styles.badge}>
            <CountBadge count={badge} small />
          </View>
        ) : null}
      </View>
      <Text variant="tab" style={{ color: tint }}>
        {label}
      </Text>
    </Pressable>
  );
}

type TabBarProps = BottomTabBarProps & {
  /** Route names left out of the bar (Messages for everyone but the Owner). */
  hidden?: string[];
  badges?: Record<string, number>;
};

/** The 3.1 bottom navigation, drawn for expo-router's Tabs (`tabBar`). */
export function TabBar({ state, navigation, insets, hidden = [], badges = {} }: TabBarProps) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={copy.main}
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      {state.routes.map((route, index) => {
        const item = TAB_ITEMS[route.name];
        if (!item || hidden.includes(route.name)) return null;
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
            badge={badges[route.name]}
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
  badge: { position: 'absolute', top: -2, right: 8 },
});
