// "Coming up" on 3.1 and 3.2 (docs/aster-reminders-location-plan.md §3): the unlocked profile's
// pending reminders, three at a time, with Add. Hidden for Guest and Restricted.
import { router } from 'expo-router';
import { AlarmClock, MapPin, Plus } from 'lucide-react-native';
import { Fragment, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import { colors, iconSizes, radii, strokes } from '@/theme';

import { canUseReminders } from './actions';
import { reminders as copy } from './copy';
import { comingUp, dueLabel, isOverdue } from './format';
import { ensureRemindersLoaded, useRemindersStore, type LocalReminder } from './store';

export const COMING_UP_ROWS = 3;

/** The time now, refreshed every minute, so labels like "9:00 PM" turn overdue on time. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function ReminderRow({ reminder, now }: { reminder: LocalReminder; now: Date }) {
  const home = reminder.trigger === 'arrive_home';
  const when = home ? copy.whenHome : dueLabel(reminder.dueAt!, now);
  const Icon = home ? MapPin : AlarmClock;
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/reminder/[id]', params: { id: reminder.clientUuid } })
      }
      accessibilityRole="button"
      accessibilityLabel={copy.rowLabel(reminder.title, when)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Icon size={iconSizes.search} color={colors.accent} strokeWidth={strokes.icon} />
      <Text variant="rowTitleToggle" numberOfLines={1} style={styles.title}>
        {reminder.title}
      </Text>
      <Text
        variant="monoSmall"
        tone={home ? 'accent' : isOverdue(reminder, now.getTime()) ? 'warning' : 'secondary'}
      >
        {when}
      </Text>
    </Pressable>
  );
}

export function ComingUp({ atHome }: { atHome: boolean }) {
  const profile = useFirstRunStore((state) => state.session?.profile);
  const all = useRemindersStore((state) => state.reminders);
  const [expanded, setExpanded] = useState(false);
  const now = useMinute();

  useEffect(() => {
    void ensureRemindersLoaded();
  }, []);

  if (!profile || !canUseReminders(profile.role)) return null;

  const list = comingUp(
    Object.values(all).filter((r) => r.profileId === profile.id),
    atHome,
  );
  const shown = expanded ? list : list.slice(0, COMING_UP_ROWS);
  const add = () => router.push({ pathname: '/reminder/[id]', params: { id: 'new' } });

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text variant="caps" tone="muted" accessibilityRole="header" style={styles.label}>
          {copy.comingUp}
        </Text>
        <Pressable
          onPress={add}
          accessibilityRole="button"
          accessibilityLabel={copy.addFirst}
          hitSlop={12}
          style={styles.add}
        >
          <Plus size={iconSizes.pill} color={colors.accent} strokeWidth={strokes.button} />
          <Text variant="link" tone="accent">
            {copy.add}
          </Text>
        </Pressable>
      </View>
      <View style={styles.card}>
        {shown.length === 0 ? (
          <Pressable
            onPress={add}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text variant="bodySmall" tone="muted" style={styles.title}>
              {copy.nothing}
            </Text>
            <Text variant="link" tone="accent">
              {copy.addFirst}
            </Text>
          </Pressable>
        ) : (
          shown.map((reminder, i) => (
            <Fragment key={reminder.clientUuid}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <ReminderRow reminder={reminder} now={now} />
            </Fragment>
          ))
        )}
        {!expanded && list.length > COMING_UP_ROWS ? (
          <>
            <View style={styles.divider} />
            <Pressable
              onPress={() => setExpanded(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <Text variant="link" tone="secondary">
                {copy.showAll(list.length)}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center' },
  label: { flex: 1 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.listCard,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pressed: { backgroundColor: colors.surface2 },
  title: { flex: 1, minWidth: 0 },
  divider: { height: 1, backgroundColor: colors.border },
});
