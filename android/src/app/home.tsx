// 3.1 Home placeholder: the first run's destination. Shows the saved first-run facts (never
// secrets). "Lock when I leave" is only armed from here on, once first run is finished (plan §5);
// the real auto-lock arrives with row 2.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton, Screen, Text, TextLink, TitleBlock } from '@/components';
import { resetFirstRun } from '@/features/first-run/actions';
import { common, homePlaceholder as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { spacing } from '@/theme';

async function reset() {
  await resetFirstRun();
  router.replace('/welcome');
}

export default function Home() {
  const facts = useFirstRunStore();
  const onOff = (value: boolean) => (value ? copy.yes : copy.no);
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
      <Text variant="label" tone="secondary">
        {copy.savedFacts}
      </Text>
      <View style={styles.list}>
        {rows.map(([label, value]) => (
          <View key={label}>
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
