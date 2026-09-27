// 5.3 Location (docs/aster-reminders-location-plan.md §3), Owner only: the day's map, arrivals and
// departures, a day at a time back to the retention limit; then the settings: Save my location,
// Keep history, Use my area in answers, and Pause for 1 hour.
import { router } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  House,
  Lock,
  LogOut,
  MapPin,
  Pause,
} from 'lucide-react-native';
import { Fragment, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  DayMap,
  LinkRow,
  ScreenHeader,
  Segmented,
  StatusLine,
  Text,
  TextLink,
  ToggleCard,
  ToggleRow,
} from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import type { LocationDay, LocationPoint } from '@/services/api/types';
import { hasMapsKey } from '@/services/buildConfig';
import { colors, iconSizes, radii, sizes, spacing, strokes } from '@/theme';

import { location as copy } from './copy';
import { dayStart, loadDay, timelineOf } from './day';
import {
  ensureLocationLoaded,
  pausedUntil,
  refreshLocationSettings,
  saveLocationSettings,
  useLocationStore,
} from './settings';
import { onDeviceUploads, readDeviceUploads } from './uploads';

const PAUSE_MS = 60 * 60 * 1000;

/** `ago`: the day it belongs to, so a slow reply for another day is never shown. */
type DayState = { ago: number } & (
  { kind: 'loading' } | { kind: 'ready'; day: LocationDay } | { kind: 'failed' }
);

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

function TimelineRow({ point }: { point: LocationPoint }) {
  const arrived = point.event === 'arrived';
  const Icon = arrived ? House : LogOut;
  return (
    <View style={styles.eventRow} accessible>
      <Text variant="monoSmall" tone="muted" style={styles.eventTime}>
        {copy.screen.time(new Date(point.recorded_at))}
      </Text>
      <View style={styles.eventTile}>
        <Icon
          size={iconSizes.chip}
          color={arrived ? colors.accent : colors.warning}
          strokeWidth={strokes.icon}
        />
      </View>
      <View style={styles.eventText}>
        <Text variant="rowTitle">{arrived ? copy.screen.arrived : copy.screen.left}</Text>
        <Text variant="helper" tone="muted">
          {arrived ? copy.screen.arrivedDetail : copy.screen.leftDetail}
        </Text>
      </View>
    </View>
  );
}

function DayArrow({
  icon: Icon,
  label,
  disabled,
  onPress,
}: {
  icon: typeof ChevronLeft;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={[styles.arrow, disabled && styles.disabled]}
    >
      <Icon size={iconSizes.search} color={colors.textSecondary} strokeWidth={strokes.icon} />
    </Pressable>
  );
}

export function LocationScreen() {
  const home = useFirstRunStore((state) => state.home);
  const settings = useLocationStore((state) => state.settings);
  const [daysAgo, setDaysAgo] = useState(0);
  const [loaded, setLoaded] = useState<DayState>({ kind: 'loading', ago: 0 });
  const [waiting, setWaiting] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const now = new Date();
  const date = dayStart(now, daysAgo);
  const paused = pausedUntil(settings);

  useEffect(() => {
    void ensureLocationLoaded().then(refreshLocationSettings);
    void readDeviceUploads().then((uploads) => setWaiting(uploads.points.length));
    return onDeviceUploads((uploads) => setWaiting(uploads.points.length));
  }, []);

  // Try again bumps this to load the same day once more.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    loadDay(dayStart(new Date(), daysAgo)).then(
      (day) => setLoaded({ kind: 'ready', day, ago: daysAgo }),
      () => setLoaded({ kind: 'failed', ago: daysAgo }),
    );
  }, [daysAgo, attempt]);

  const state: DayState = loaded.ago === daysAgo ? loaded : { kind: 'loading', ago: daysAgo };

  function retry() {
    setLoaded({ kind: 'loading', ago: daysAgo });
    setAttempt((n) => n + 1);
  }

  async function save(patch: Parameters<typeof saveLocationSettings>[0]) {
    setSaveFailed(false);
    if (!(await saveLocationSettings(patch))) setSaveFailed(true);
  }

  const points = state.kind === 'ready' ? state.day.data : [];
  const events = timelineOf(points);
  const oldest = Math.max(0, settings.retention_days - 1);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenHeader title={copy.screen.title} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <DayMap
          home={home ? { latitude: home.lat, longitude: home.lng } : null}
          radiusM={home?.radius_m ?? 0}
          path={points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          label={copy.screen.mapLabel}
          mapEnabled={hasMapsKey}
        />
        <View style={styles.content}>
          <View style={styles.dayRow}>
            <DayArrow
              icon={ChevronLeft}
              label={copy.screen.previousDay}
              disabled={daysAgo >= oldest}
              onPress={() => setDaysAgo((d) => Math.min(oldest, d + 1))}
            />
            <Text variant="rowTitle" style={styles.dayLabel} accessibilityRole="header">
              {copy.screen.day(date, daysAgo)}
            </Text>
            <DayArrow
              icon={ChevronRight}
              label={copy.screen.nextDay}
              disabled={daysAgo === 0}
              onPress={() => setDaysAgo((d) => Math.max(0, d - 1))}
            />
          </View>

          <View style={styles.card}>
            {state.kind === 'failed' ? (
              <View style={styles.message}>
                <Text variant="bodySmall" tone="muted">
                  {copy.screen.loadFailed}
                </Text>
                <TextLink label={copy.screen.tryAgain} onPress={retry} />
              </View>
            ) : state.kind === 'loading' ? (
              <View style={styles.message} />
            ) : events.length === 0 ? (
              <View style={styles.message}>
                <Text variant="rowTitle">{copy.screen.noEvents}</Text>
                <Text variant="helper" tone="muted">
                  {copy.screen.points(points.length)}
                </Text>
              </View>
            ) : (
              events.map((point, i) => (
                <Fragment key={point.id}>
                  {i > 0 ? <View style={styles.divider} /> : null}
                  <TimelineRow point={point} />
                </Fragment>
              ))
            )}
          </View>

          <Text variant="caps" tone="muted" style={styles.settingsLabel} accessibilityRole="header">
            {copy.screen.settings}
          </Text>
          <ToggleCard>
            <ToggleRow
              icon={MapPin}
              iconTone="neutral"
              title={copy.screen.save}
              subtitle={copy.screen.saveDetail(settings.interval_minutes)}
              value={settings.enabled}
              onValueChange={(enabled) => void save({ enabled })}
            />
            <LinkRow
              icon={Clock}
              title={copy.screen.keep}
              value={copy.screen.keepDays(settings.retention_days)}
              onPress={() => setChoosing((open) => !open)}
            />
            <ToggleRow
              icon={Globe}
              iconTone="neutral"
              title={copy.screen.area}
              subtitle={copy.screen.areaDetail}
              value={settings.share_area}
              onValueChange={(share_area) => void save({ share_area })}
            />
          </ToggleCard>
          {choosing ? (
            <Segmented
              label={copy.screen.keepTitle}
              options={copy.screen.keepChoices.map((days) => ({
                value: days,
                label: String(days),
              }))}
              value={settings.retention_days}
              onChange={(retention_days) => {
                setChoosing(false);
                void save({ retention_days });
              }}
            />
          ) : null}

          {paused ? (
            <View style={styles.pausedRow}>
              <Pause size={iconSizes.search} color={colors.warning} strokeWidth={strokes.icon} />
              <Text variant="bodySmall" tone="secondary" style={styles.pausedText}>
                {copy.screen.pausedUntil(paused)}
              </Text>
              <TextLink
                label={copy.screen.resume}
                onPress={() => void save({ paused_until: null })}
              />
            </View>
          ) : (
            <Pressable
              onPress={() =>
                void save({ paused_until: new Date(Date.now() + PAUSE_MS).toISOString() })
              }
              disabled={!settings.enabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: !settings.enabled }}
              style={({ pressed }) => [
                styles.pause,
                pressed && styles.pausePressed,
                !settings.enabled && styles.disabled,
              ]}
            >
              <Pause size={iconSizes.search} color={colors.warning} strokeWidth={strokes.icon} />
              <Text variant="link">{copy.screen.pause}</Text>
            </Pressable>
          )}

          {saveFailed ? (
            <StatusLine status={{ tone: 'danger', text: copy.screen.saveFailed }} />
          ) : null}

          <View style={styles.footnote}>
            <Lock size={iconSizes.pill} color={colors.textMuted} strokeWidth={strokes.icon} />
            <Text variant="helper" tone="muted" style={styles.footnoteText}>
              {copy.screen.ownerOnly(settings.retention_days)}
            </Text>
          </View>
          {waiting > 0 ? (
            <Text variant="helper" tone="muted">
              {copy.screen.waiting(waiting)}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.contentBottom },
  content: { paddingHorizontal: spacing.screenX, paddingTop: 14, gap: 12 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayLabel: { flex: 1, textAlign: 'center' },
  arrow: {
    width: sizes.dayArrow,
    height: sizes.dayArrow,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.listCard,
    overflow: 'hidden',
  },
  message: { minHeight: 58, paddingVertical: 12, paddingHorizontal: 16, gap: 2 },
  divider: { height: 1, backgroundColor: colors.border },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  eventTime: { width: 62 },
  eventTile: {
    width: sizes.timelineTile,
    height: sizes.timelineTile,
    borderRadius: 10,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventText: { flex: 1, gap: 1 },
  settingsLabel: { marginTop: 8 },
  pause: {
    height: sizes.secondaryButton,
    borderRadius: radii.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pausePressed: { borderColor: colors.borderStrong },
  pausedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pausedText: { flex: 1 },
  footnote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footnoteText: { flex: 1 },
});
