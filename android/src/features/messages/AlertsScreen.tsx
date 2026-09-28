// 4.3 Spoken alerts (docs/aster-messages-alerts-plan.md §3 4.3), Owner only: Speak missed messages,
// the VIP contacts with their switches and Add, "Count it as missed after", "What Aster says" with
// its sample, and Quiet hours with urgent words, headphones only and only at home. Every change
// shows at once, goes to Laravel and to the native engine, and is put back if Laravel refuses.
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useFocusEffect } from 'expo-router';
import { Headphones, House, Moon, Plus, Siren, Volume2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ScreenHeader,
  Segmented,
  SmallPill,
  StatusLine,
  Switch,
  Text,
  ToggleCard,
  ToggleRow,
} from '@/components';
import type { AlertSettings, SpeakMode, VipContact } from '@/services/api';
import { colors, iconSizes, radii, spacing, strokes } from '@/theme';

import { AccessCallout } from './AccessCallout';
import { refreshAlerts, saveAlertSettings, setVipEnabled, useAlertsStore } from './alerts';
import { alerts as copy } from './copy';
import { clock } from './format';
import { refreshThreads } from './threads';
import { SenderAvatar } from './ThreadRow';

/** 11:00 PM to 7:00 AM when quiet hours are turned on. (proposed) */
export const DEFAULT_QUIET = { start: '23:00', end: '07:00' };

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

/** "23:00" as a Date today, for the time dialog and the label. */
function atTime(hhmm: string): Date {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

const hhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

function VipRow({ vip, first }: { vip: VipContact; first: boolean }) {
  return (
    <View style={[styles.vipRow, !first && styles.divider]}>
      <Pressable
        onPress={() => router.push({ pathname: '/vip/[id]', params: { id: String(vip.id) } })}
        accessibilityRole="button"
        accessibilityLabel={vip.name}
        accessibilityHint={copy.vipSources(vip.sources)}
        style={({ pressed }) => [styles.vipOpen, pressed && styles.pressed]}
      >
        <SenderAvatar name={vip.name} source={vip.sources[0] ?? 'whatsapp'} />
        <View style={styles.vipText}>
          <Text variant="rowTitle" numberOfLines={1}>
            {vip.name}
          </Text>
          <Text variant="helper" tone="muted" numberOfLines={1}>
            {copy.vipSources(vip.sources)}
          </Text>
        </View>
      </Pressable>
      <Switch
        value={vip.enabled}
        label={vip.name}
        onValueChange={(enabled) => void setVipEnabled(vip.id, enabled)}
      />
    </View>
  );
}

function Label({ children }: { children: string }) {
  return (
    <Text variant="label" tone="secondary" accessibilityRole="header">
      {children}
    </Text>
  );
}

export function AlertsScreen() {
  const settings = useAlertsStore((state) => state.settings);
  const vips = useAlertsStore((state) => state.vips);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshAlerts();
      void refreshThreads();
    }, []),
  );

  async function save(patch: Partial<AlertSettings>) {
    setFailed(false);
    if (!(await saveAlertSettings(patch))) setFailed(true);
  }

  const quietOn = settings.quiet_start != null && settings.quiet_end != null;
  const minuteChoices = [...new Set([...copy.missedChoices, settings.missed_after_minutes])]
    .sort((a, b) => a - b)
    .map((n) => ({ value: n, label: copy.minutes(n) }));
  const sampleName = vips.find((vip) => vip.enabled)?.name ?? copy.sampleName;

  function pickTime(which: 'quiet_start' | 'quiet_end') {
    const current =
      settings[which] ?? (which === 'quiet_start' ? DEFAULT_QUIET.start : DEFAULT_QUIET.end);
    DateTimePickerAndroid.open({
      value: atTime(current),
      mode: 'time',
      is24Hour: false,
      onChange: (event, picked) => {
        if (event.type !== 'set' || !picked) return;
        void save({ [which]: hhmm(picked) });
      },
    });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenHeader title={copy.title} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <AccessCallout />
        <ToggleCard>
          <ToggleRow
            icon={Volume2}
            iconTone="neutral"
            title={copy.speak}
            subtitle={copy.speakDetail}
            value={settings.enabled}
            onValueChange={(enabled) => void save({ enabled })}
          />
        </ToggleCard>

        <View style={styles.section}>
          <Label>{copy.vips}</Label>
          <View style={styles.card}>
            {vips.map((vip, i) => (
              <VipRow key={vip.id} vip={vip} first={i === 0} />
            ))}
            <Pressable
              onPress={() => router.push({ pathname: '/vip/[id]', params: { id: 'new' } })}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.addRow,
                vips.length > 0 && styles.divider,
                pressed && styles.pressed,
              ]}
            >
              <Plus size={iconSizes.search} color={colors.accent} strokeWidth={strokes.button} />
              <Text variant="link" tone="accent">
                {copy.addVip}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Label>{copy.missedAfter}</Label>
          <Segmented
            options={minuteChoices}
            value={settings.missed_after_minutes}
            onChange={(minutes) => void save({ missed_after_minutes: minutes })}
            label={copy.missedAfter}
          />
          <Text variant="helper" tone="muted">
            {copy.missedHelp}
          </Text>
        </View>

        <View style={styles.section}>
          <Label>{copy.says}</Label>
          <Segmented<SpeakMode>
            options={copy.speakModes}
            value={settings.speak_mode}
            onChange={(mode) => void save({ speak_mode: mode })}
            label={copy.says}
          />
          <View style={styles.sample}>
            <Text variant="bodySmall">{copy.sample(settings.speak_mode, sampleName)}</Text>
          </View>
          {settings.speak_mode === 'summary' ? (
            <Text variant="helper" tone="muted">
              {copy.summaryNote}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Label>{copy.quietHours}</Label>
          <ToggleCard>
            <ToggleRow
              icon={Moon}
              iconTone="neutral"
              title={copy.quietHours}
              subtitle={
                quietOn
                  ? copy.quietRange(
                      clock(atTime(settings.quiet_start!)),
                      clock(atTime(settings.quiet_end!)),
                    )
                  : copy.quietOff
              }
              value={quietOn}
              onValueChange={(on) =>
                void save(
                  on
                    ? { quiet_start: DEFAULT_QUIET.start, quiet_end: DEFAULT_QUIET.end }
                    : { quiet_start: null, quiet_end: null },
                )
              }
            />
            {quietOn ? (
              <View style={styles.times}>
                <SmallPill
                  icon={Moon}
                  label={`${copy.from} ${clock(atTime(settings.quiet_start!))}`}
                  onPress={() => pickTime('quiet_start')}
                />
                <SmallPill
                  icon={Moon}
                  label={`${copy.to} ${clock(atTime(settings.quiet_end!))}`}
                  onPress={() => pickTime('quiet_end')}
                />
              </View>
            ) : null}
            <ToggleRow
              icon={Siren}
              iconTone="neutral"
              title={copy.urgent}
              subtitle={copy.urgentDetail}
              value={settings.urgent_keywords.length > 0}
              onValueChange={(on) =>
                void save({ urgent_keywords: on ? [...copy.urgentWords] : [] })
              }
            />
            <ToggleRow
              icon={Headphones}
              iconTone="neutral"
              title={copy.headphones}
              subtitle={copy.headphonesDetail}
              value={settings.headphones_only}
              onValueChange={(on) => void save({ headphones_only: on })}
            />
            <ToggleRow
              icon={House}
              iconTone="neutral"
              title={copy.atHome}
              subtitle={copy.atHomeDetail}
              value={settings.only_at_home}
              onValueChange={(on) => void save({ only_at_home: on })}
            />
          </ToggleCard>
        </View>

        {failed ? <StatusLine status={{ tone: 'danger', text: copy.saveFailed }} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 8,
    paddingBottom: spacing.contentBottom,
    gap: 18,
  },
  section: { gap: 8 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.toggleCard,
    paddingHorizontal: 16,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { opacity: 0.7 },
  vipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  vipOpen: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  vipText: { flex: 1, minWidth: 0, gap: 2 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
  sample: {
    padding: 14,
    borderRadius: radii.callout,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningTint,
  },
  times: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
});
