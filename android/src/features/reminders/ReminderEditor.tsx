// Add or edit a reminder (docs/aster-reminders-location-plan.md §3; the canvas has no such screen,
// so its layout follows 5.1 and 1.3): what, when (a time or arriving home), quick picks and
// Android's date and time dialogs, and callouts when notifications or background location are
// missing. Editing adds Mark done and Delete.
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { BellOff, CalendarDays, Clock, Check, MapPin } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, View } from 'react-native';

import {
  InfoCallout,
  PrimaryButton,
  Screen,
  ScreenHeader,
  Segmented,
  SuggestionChip,
  Text,
  TextField,
  TextLink,
} from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import { isAtHome } from '@/features/home-mode/mode';
import { useHomeModeStore } from '@/features/home-mode/store';
import type { ReminderTrigger } from '@/services/api/types';
import { notificationsAllowed, requestNotifications } from '@/services/notifications';
import { permissionEntries } from '@/services/permissions';
import { colors, iconSizes, radii, sizes, spacing, strokes } from '@/theme';

import { addReminder, deleteReminder, editReminder, markDone } from './actions';
import { reminders as copy } from './copy';
import { clock12, dayLabel, quickTimes } from './format';
import { ensureRemindersLoaded, useRemindersStore } from './store';

const TITLE_MAX = 200;
/** A time closer than this counts as past: it would ring before Save finishes. */
const MIN_AHEAD_MS = 30_000;

const locationEntry = permissionEntries.find((entry) => entry.key === 'location')!;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

/** Notifications and background location, re-checked whenever the app comes back. */
function useReadiness() {
  const [notify, setNotify] = useState(true);
  const [background, setBackground] = useState(true);
  const check = useCallback(() => {
    void notificationsAllowed()
      .then(setNotify)
      .catch(() => {});
    void locationEntry
      .check()
      .then((status) => setBackground(status === 'allowed'))
      .catch(() => {});
  }, []);
  useEffect(() => {
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => subscription.remove();
  }, [check]);
  return { notify, background, check };
}

function PickerPill({
  icon: Icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  icon: typeof Clock;
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}, ${label}`}
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
    >
      <Icon size={iconSizes.search} color={colors.accent} strokeWidth={strokes.icon} />
      <Text variant="rowTitleToggle">{label}</Text>
    </Pressable>
  );
}

export function ReminderEditor({ id }: { id: string }) {
  const isNew = id === 'new';
  const profile = useFirstRunStore((state) => state.session?.profile);
  const existing = useRemindersStore((state) => (isNew ? undefined : state.reminders[id]));
  const loaded = useRemindersStore((state) => state.loaded);
  const atHome = useHomeModeStore((state) => isAtHome(state.mode));
  const { notify, background, check } = useReadiness();

  const [title, setTitle] = useState(existing?.title ?? '');
  const [trigger, setTrigger] = useState<ReminderTrigger>(existing?.trigger ?? 'time');
  const [due, setDue] = useState<Date>(() =>
    existing?.dueAt ? new Date(existing.dueAt) : quickTimes(new Date()).inHour,
  );
  const [error, setError] = useState<{ field: 'title' | 'due'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void ensureRemindersLoaded();
  }, []);

  // Opened from a notification or a list that has since changed: fill in once it's loaded.
  const [filledFrom, setFilledFrom] = useState(existing?.clientUuid ?? null);
  if (existing && filledFrom !== existing.clientUuid) {
    setFilledFrom(existing.clientUuid);
    setTitle(existing.title);
    setTrigger(existing.trigger);
    if (existing.dueAt) setDue(new Date(existing.dueAt));
  }

  const mine = existing && existing.profileId === profile?.id && existing.status === 'pending';
  if (!isNew && loaded && !mine) {
    return (
      <Screen header={<ScreenHeader title={copy.editor.editTitle} onBack={goBack} />}>
        <InfoCallout icon={BellOff} tone="neutral" text={copy.editor.notFound} />
      </Screen>
    );
  }

  const now = new Date();
  const quick = quickTimes(now);

  function pick(mode: 'date' | 'time') {
    DateTimePickerAndroid.open({
      value: due,
      mode,
      is24Hour: false,
      minimumDate: mode === 'date' ? new Date() : undefined,
      onChange: (event, picked) => {
        if (event.type !== 'set' || !picked) return;
        const next = new Date(due);
        if (mode === 'date')
          next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
        else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
        setDue(next);
        setError(null);
      },
    });
  }

  async function allowNotifications() {
    if (!(await requestNotifications())) await Linking.openSettings();
    check();
  }

  async function allowLocation() {
    await locationEntry.request();
    check();
  }

  async function save() {
    const clean = title.trim();
    if (!clean) {
      setError({ field: 'title', text: copy.editor.errors.title });
      return;
    }
    if (trigger === 'time' && due.getTime() < Date.now() + MIN_AHEAD_MS) {
      setError({ field: 'due', text: copy.editor.errors.past });
      return;
    }
    setBusy(true);
    const input = { title: clean, trigger, dueAt: trigger === 'time' ? due : null };
    try {
      if (isNew) await addReminder(input, atHome);
      else await editReminder(id, input, atHome);
      goBack();
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    await markDone(id);
    goBack();
  }

  function confirmDelete() {
    Alert.alert(copy.editor.deleteTitle, copy.editor.deleteBody, [
      { text: copy.editor.cancel, style: 'cancel' },
      {
        text: copy.editor.delete,
        style: 'destructive',
        onPress: () => {
          void deleteReminder(id).then(goBack);
        },
      },
    ]);
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title={isNew ? copy.editor.newTitle : copy.editor.editTitle}
          onBack={goBack}
        />
      }
      footer={
        <>
          <PrimaryButton label={copy.editor.save} icon={Check} onPress={save} busy={busy} />
          {isNew ? null : (
            <View style={styles.editActions}>
              <TextLink label={copy.editor.markDone} onPress={() => void done()} />
              <Pressable
                onPress={confirmDelete}
                accessibilityRole="button"
                style={styles.delete}
                hitSlop={8}
              >
                <Text variant="link" tone="danger">
                  {copy.editor.delete}
                </Text>
              </Pressable>
            </View>
          )}
        </>
      }
    >
      <TextField
        label={copy.editor.what}
        placeholder={copy.editor.whatPlaceholder}
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          if (error?.field === 'title') setError(null);
        }}
        maxLength={TITLE_MAX}
        autoFocus={isNew}
        returnKeyType="done"
        error={error?.field === 'title' ? error.text : undefined}
      />

      <View style={styles.block}>
        <Text variant="label" tone="secondary">
          {copy.editor.when}
        </Text>
        <Segmented
          label={copy.editor.when}
          options={[
            { value: 'time', label: copy.editor.atTime },
            { value: 'arrive_home', label: copy.editor.whenHome },
          ]}
          value={trigger}
          onChange={(value) => {
            setTrigger(value);
            setError(null);
          }}
        />
      </View>

      {trigger === 'time' ? (
        <View style={styles.block}>
          <View style={styles.chips}>
            <SuggestionChip label={copy.editor.inHour} onPress={() => setDue(quick.inHour)} />
            {quick.tonight ? (
              <SuggestionChip label={copy.editor.tonight} onPress={() => setDue(quick.tonight!)} />
            ) : null}
            <SuggestionChip
              label={copy.editor.tomorrowMorning}
              onPress={() => setDue(quick.tomorrowMorning)}
            />
          </View>
          <View style={styles.pills}>
            <PickerPill
              icon={CalendarDays}
              label={dayLabel(due, now)}
              accessibilityLabel={copy.editor.day}
              onPress={() => pick('date')}
            />
            <PickerPill
              icon={Clock}
              label={clock12(due)}
              accessibilityLabel={copy.editor.time}
              onPress={() => pick('time')}
            />
          </View>
          {error?.field === 'due' ? (
            <Text variant="status" tone="danger" accessibilityLiveRegion="polite">
              {error.text}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.block}>
          <View style={styles.homeHelp}>
            <MapPin size={iconSizes.search} color={colors.accent} strokeWidth={strokes.icon} />
            <Text variant="helper" tone="secondary">
              {copy.editor.homeHelp}
            </Text>
          </View>
          {background ? null : (
            <View style={styles.callout}>
              <InfoCallout icon={MapPin} tone="warning" text={copy.editor.needsLocation} />
              <TextLink label={copy.editor.allow} onPress={() => void allowLocation()} />
            </View>
          )}
        </View>
      )}

      {notify ? null : (
        <View style={styles.callout}>
          <InfoCallout icon={BellOff} tone="warning" text={copy.editor.notificationsOff} />
          <TextLink label={copy.editor.allow} onPress={() => void allowNotifications()} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.fieldLabelGap },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.chipGap },
  pills: { flexDirection: 'row', gap: 10 },
  pill: {
    flex: 1,
    height: sizes.input,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  pillPressed: { borderColor: colors.borderStrong },
  homeHelp: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  callout: { gap: 2 },
  editActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  delete: { minHeight: sizes.textLink, justifyContent: 'center', paddingHorizontal: 8 },
});
