// 5.1 Settings, a tab. Profile section: who is unlocked, and Lock (back to 2.1). Assistant section:
// choose who answers chats. Local is Zephyr on the home computer; Mark-L (named in the admin panel)
// is Gemini through the same computer. The choice applies on this phone at once and reaches Laravel
// now if unlocked, else at the next unlock. The Owner also sees Home and location, which opens 5.3
// (reminders plan §3).
import { router } from 'expo-router';
import { Cloud, Cpu, History, House, HouseWifi, Lock } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
  type FieldStatus,
} from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import { location as locationCopy } from '@/features/location/copy';
import { pausedUntil, useLocationStore } from '@/features/location/settings';
import { DevFacts } from '@/features/settings/DevFacts';
import { lockSession } from '@/features/profiles/actions';
import { whoIsUsing } from '@/features/profiles/copy';
import { chooseLlmEngine } from '@/features/settings/actions';
import { settings as copy } from '@/features/settings/copy';
import type { LlmEngine } from '@/services/api';
import { colors, profileColorKey, radii, spacing } from '@/theme';

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
