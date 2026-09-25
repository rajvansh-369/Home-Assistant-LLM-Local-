// 3.1 Home placeholder: the first run's destination. Shows the saved first-run facts (never
// secrets). "Lock when I leave" is only armed from here on, once first run is finished (plan §5);
// the real auto-lock arrives with row 2.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton, Screen, Text, TextLink, TitleBlock } from '@/components';
import { resetFirstRun } from '@/features/first-run/actions';
import { common, homePlaceholder as copy, permissions } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { isHomeGeofenceRunning } from '@/services/geofence';
import { readGeofenceEvents, type GeofenceEvent } from '@/tasks/geofence-task';
import { spacing } from '@/theme';

async function reset() {
  await resetFirstRun();
  router.replace('/welcome');
}

export default function Home() {
  const facts = useFirstRunStore();
  const [geofence, setGeofence] = useState<boolean | null>(null);
  const [lastEvent, setLastEvent] = useState<GeofenceEvent | null>(null);

  useEffect(() => {
    let active = true;
    isHomeGeofenceRunning()
      .then((running) => active && setGeofence(running))
      .catch(() => active && setGeofence(false));
    readGeofenceEvents()
      .then((events) => active && setLastEvent(events.at(-1) ?? null))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const onOff = (value: boolean) => (value ? copy.yes : copy.no);
  const skipped = facts.permissionsSkipped.map((key) => permissions.rows[key].title).join(', ');
  const rows: [string, string][] = [
    [copy.facts.server, facts.serverUrl ?? copy.none],
    [copy.facts.email, facts.email ?? copy.none],
    [copy.facts.owner, facts.owner ? `${facts.owner.name} · ${common.colourNames[facts.owner.color]}` : copy.none],
    [
      copy.facts.home,
      facts.home ? `${facts.home.address} · ${facts.home.radius_m} m` : copy.none,
    ],
    [copy.facts.wifi, facts.home?.wifi_ssid ?? copy.none],
    [copy.facts.llm, facts.home?.llm_url ?? copy.none],
    [copy.facts.fingerprint, onOff(facts.fingerprintEnabled)],
    [copy.facts.lockWhenLeave, onOff(facts.lockWhenLeave)],
    [copy.facts.permissionsDone, onOff(facts.permissionsDone)],
    [copy.facts.skipped, skipped || copy.none],
    [copy.facts.geofence, geofence === null ? copy.none : onOff(geofence)],
    [
      copy.facts.lastGeofenceEvent,
      lastEvent ? copy.geofenceEvent(lastEvent.type, new Date(lastEvent.at).toLocaleString()) : copy.none,
    ],
  ];

  return (
    <Screen
      footer={
        __DEV__ ? (
          <>
            <PrimaryButton label={copy.reset} onPress={reset} />
            <TextLink label={copy.gallery} onPress={() => router.push('/dev/gallery')} />
          </>
        ) : undefined
      }
    >
      <TitleBlock title={copy.title} subtitle={copy.subtitle} />
      <Text variant="label" tone="secondary" accessibilityRole="header">
        {copy.savedFacts}
      </Text>
      <View style={styles.list}>
        {rows.map(([label, value]) => (
          // One TalkBack stop per fact: "Server, https://…".
          <View key={label} accessible accessibilityLabel={`${label}, ${value}`}>
            <Text variant="helper" tone="muted">
              {label}
            </Text>
            <Text variant="body">{value}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.featureRowsApart },
});
