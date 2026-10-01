// 5.1 Settings, a tab. Profile section: who is unlocked, and Lock (back to 2.1). Assistant section:
// choose who answers chats. Local is Zephyr on the home computer; Mark-L (named in the admin panel)
// is Gemini through the same computer. The choice applies on this phone at once and reaches Laravel
// now if unlocked, else at the next unlock. The Owner also sees Home and location, which opens 5.3
// (reminders plan §3), Alerts and background (4.3 and battery use) and Privacy's Profiles (2.3) and
// "Hide message text on lock screen" (docs/aster-messages-alerts-plan.md §3 5.1). Every profile
// but Guest has Privacy's "Memory and activity" (5.2, docs/aster-profiles-memory-plan.md §4).
import { router } from 'expo-router';
import {
  Brain,
  Cloud,
  Cpu,
  EyeOff,
  History,
  House,
  HouseWifi,
  Lock,
  Users,
  Volume2,
  Zap,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import {
  Avatar,
  ChoiceCard,
  InfoCallout,
  LinkRow,
  Screen,
  SmallPill,
  StatusLine,
  Text,
  TitleBlock,
  ToggleCard,
  ToggleRow,
  type FieldStatus,
} from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import { location as locationCopy } from '@/features/location/copy';
import { pausedUntil, useLocationStore } from '@/features/location/settings';
import { setHideOnLockScreen, useAlertsStore } from '@/features/messages/alerts';
import { DevFacts } from '@/features/settings/DevFacts';
import { lockSession } from '@/features/profiles/actions';
import { whoIsUsing } from '@/features/profiles/copy';
import { useProfilesStore } from '@/features/profiles/store';
import { chooseLlmEngine } from '@/features/settings/actions';
import { settings as copy } from '@/features/settings/copy';
import type { LlmEngine } from '@/services/api';
import { colors, profileColorKey, radii, spacing } from '@/theme';

import AsterSystem from '../../../modules/aster-system';

const ICONS = { local: Cpu, markl: Cloud } as const;

/** 5.1 Home and location, Owner only (reminders plan §3). */
function HomeAndLocation() {
  const home = useFirstRunStore((state) => state.home);
  const settings = useLocationStore((state) => state.settings);
  const rows = locationCopy.settingsRows;
  const paused = pausedUntil(settings);
  const history = !settings.enabled
    ? rows.off
    : paused
      ? rows.paused(paused)
      : rows.historyDetail(settings.interval_minutes, settings.retention_days);
  return (
    <View style={styles.section}>
      <Text variant="label" tone="secondary" accessibilityRole="header">
        {rows.section}
      </Text>
      <ToggleCard>
        {home ? (
          <LinkRow
            icon={House}
            title={rows.home}
            subtitle={rows.homeDetail(home.address, home.radius_m)}
          />
        ) : null}
        <LinkRow
          icon={History}
          title={rows.history}
          subtitle={history}
          onPress={() => router.push('/location')}
        />
      </ToggleCard>
    </View>
  );
}

/** Battery use is "Unrestricted", read again whenever the app comes back. */
function useUnrestricted(): boolean {
  const [unrestricted, setUnrestricted] = useState(() =>
    AsterSystem.isIgnoringBatteryOptimizations(),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setUnrestricted(AsterSystem.isIgnoringBatteryOptimizations());
    });
    return () => subscription.remove();
  }, []);
  return unrestricted;
}

/** 5.1 Alerts and background, and Privacy, Owner only. */
/** 5.1 Alerts and background, Owner only. */
function AlertsAndBackground() {
  const settings = useAlertsStore((state) => state.settings);
  const vips = useAlertsStore((state) => state.vips.filter((vip) => vip.enabled).length);
  const unrestricted = useUnrestricted();
  return (
    <View style={styles.section}>
      <Text variant="label" tone="secondary" accessibilityRole="header">
        {copy.alertsSection}
      </Text>
      <ToggleCard>
        <LinkRow
          icon={Volume2}
          title={copy.spokenAlerts}
          subtitle={
            settings.enabled
              ? copy.spokenDetail(vips, settings.missed_after_minutes)
              : copy.spokenOff
          }
          onPress={() => router.push('/alerts')}
        />
        <LinkRow
          icon={Zap}
          title={copy.background}
          subtitle={unrestricted ? copy.unrestricted : copy.optimized}
          onPress={unrestricted ? undefined : () => AsterSystem.requestIgnoreBatteryOptimizations()}
        />
      </ToggleCard>
    </View>
  );
}

/** 5.1 Privacy: Profiles and the lock-screen choice for the Owner; Memory and activity for all. */
function Privacy({ owner }: { owner: boolean }) {
  const hide = useAlertsStore((state) => state.hideOnLockScreen);
  const profiles = useProfilesStore((state) => state.profiles.length);
  return (
    <View style={styles.section}>
      <Text variant="label" tone="secondary" accessibilityRole="header">
        {copy.privacy}
      </Text>
      <ToggleCard>
        {owner ? (
          <LinkRow
            icon={Users}
            title={copy.profiles}
            value={profiles > 0 ? String(profiles) : undefined}
            onPress={() => router.push('/profiles')}
          />
        ) : null}
        {owner ? (
          <ToggleRow
            icon={EyeOff}
            iconTone="neutral"
            title={copy.hideText}
            value={hide}
            onValueChange={(value) => void setHideOnLockScreen(value)}
          />
        ) : null}
        <LinkRow icon={Brain} title={copy.memory} onPress={() => router.push('/memory')} />
      </ToggleCard>
    </View>
  );
}

export default function Settings() {
  const engine = useFirstRunStore((state) => state.llmEngine);
  const profile = useFirstRunStore((state) => state.session?.profile);
  // An engine a newer server adds has no copy here yet: leave it out rather than crash.
  const engines = useFirstRunStore((state) => state.engines).filter((e) => e.id in copy.engines);
  const [status, setStatus] = useState<FieldStatus | null>(null);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  async function choose(next: LlmEngine) {
    if (next === engine) return;
    setStatus(null);
    const result = await chooseLlmEngine(next);
    if (!mounted.current) return;
    setStatus(
      result === 'saved'
        ? { tone: 'accent', icon: 'check', text: copy.saved }
        : { tone: 'muted', text: copy.pending },
    );
  }

  return (
    <Screen inTabs>
      <TitleBlock title={copy.title} />
      {profile ? (
        <View style={styles.profile}>
          <Avatar color={profileColorKey(profile.color)} name={profile.name} size="header" />
          <View style={styles.profileText}>
            <Text variant="rowTitle" numberOfLines={1}>
              {profile.name}
            </Text>
            <Text variant="helper" tone="muted">
              {whoIsUsing.roles[profile.role]}
            </Text>
          </View>
          <SmallPill label={copy.lock} icon={Lock} onPress={lockSession} />
        </View>
      ) : null}
      <View style={styles.section}>
        <Text variant="label" tone="secondary" accessibilityRole="header">
          {copy.assistant}
        </Text>
        <Text variant="helper" tone="muted">
          {copy.assistantHelp}
        </Text>
      </View>
      <View
        style={styles.choices}
        accessibilityRole="radiogroup"
        accessibilityLabel={copy.assistant}
      >
        {engines.map((option) => (
          <ChoiceCard
            key={option.id}
            icon={ICONS[option.id]}
            title={option.name}
            tag={copy.engines[option.id].tag}
            description={copy.engines[option.id].description}
            selected={option.id === engine}
            onPress={() => choose(option.id)}
          />
        ))}
      </View>
      {status ? <StatusLine status={status} /> : null}
      <InfoCallout icon={HouseWifi} text={copy.homeWifi} />
      {profile?.role === 'owner' ? <HomeAndLocation /> : null}
      {profile?.role === 'owner' ? <AlertsAndBackground /> : null}
      {profile && profile.role !== 'guest' ? <Privacy owner={profile.role === 'owner'} /> : null}
      {__DEV__ ? <DevFacts /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radii.listCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  profileText: { flex: 1, minWidth: 0 },
  section: { gap: 4 },
  choices: { gap: spacing.permissionRowsApart },
});
