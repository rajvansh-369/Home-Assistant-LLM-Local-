// 5.1 Settings, Assistant section: choose who answers chats. Local is Zephyr on the home computer;
// Mark-L (named in the admin panel) is Gemini through the same computer. The choice applies on
// this phone at once and reaches Laravel now if unlocked, else at the next unlock.
import { router } from 'expo-router';
import { Cloud, Cpu, HouseWifi } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  BackButton,
  ChoiceCard,
  InfoCallout,
  Screen,
  StatusLine,
  Text,
  TitleBlock,
  type FieldStatus,
} from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import { chooseLlmEngine } from '@/features/settings/actions';
import { settings as copy } from '@/features/settings/copy';
import type { LlmEngine } from '@/services/api';
import { sizes, spacing } from '@/theme';

const ICONS = { local: Cpu, markl: Cloud } as const;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

export default function Settings() {
  const engine = useFirstRunStore((state) => state.llmEngine);
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
    <Screen
      header={
        <View style={styles.backRow}>
          <BackButton onPress={goBack} />
        </View>
      }
    >
      <TitleBlock title={copy.title} />
      <View style={styles.section}>
        <Text variant="label" tone="secondary" accessibilityRole="header">
          {copy.assistant}
        </Text>
        <Text variant="helper" tone="muted">
          {copy.assistantHelp}
        </Text>
      </View>
      <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={copy.assistant}>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {
    height: sizes.header,
    paddingHorizontal: spacing.headerX,
    justifyContent: 'center',
  },
  section: { gap: 4 },
  choices: { gap: spacing.permissionRowsApart },
});
