// 5.1's "Voice and speech" (docs/aster-voice-plan.md §3 5.1, proposed): the phone's English and
// Hindi voices, the speed, "Test", and where speech is recognised. Per phone (decision 9); a change
// reaches the native speaker at once (settings.ts).
import { router } from 'expo-router';
import { Check, Volume2 } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader, Segmented, SmallPill, Text } from '@/components';
import { colors, iconSizes, radii, spacing, strokes } from '@/theme';

import AsterSystem from '../../../modules/aster-system';

import { voice as voiceCopy } from './copy';
import { SPEECH_RATES, useVoiceSettings } from './settings';
import { recognitionLabel, useDeviceVoices } from './voices';

const copy = voiceCopy.settings;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

function Label({ children }: { children: string }) {
  return (
    <Text variant="label" tone="secondary" accessibilityRole="header">
      {children}
    </Text>
  );
}

function VoiceRow({
  label,
  selected,
  first,
  onPress,
}: {
  label: string;
  selected: boolean;
  first: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}
    >
      <Text variant="body" style={styles.flex}>
        {label}
      </Text>
      {selected ? (
        <Check size={iconSizes.search} color={colors.accent} strokeWidth={strokes.button} />
      ) : null}
    </Pressable>
  );
}

let testId = 0;

export function VoiceSettingsScreen() {
  const voice = useVoiceSettings((state) => state.voice);
  const rate = useVoiceSettings((state) => state.rate);
  const set = useVoiceSettings((state) => state.set);
  const { voices } = useDeviceVoices();
  const tested = useRef(false);

  // A test still talking stops when the screen closes.
  useEffect(
    () => () => {
      if (tested.current) AsterSystem.stopSpeaking();
    },
    [],
  );

  function test() {
    tested.current = true;
    AsterSystem.stopSpeaking();
    AsterSystem.speakQueued(copy.testSentence, `voice-test-${++testId}`);
  }

  const known = voice == null || voices.some((v) => v.name === voice);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenHeader title={copy.voiceAndSpeech} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Label>{copy.voiceLabel}</Label>
          <View style={styles.card} accessibilityRole="radiogroup" accessibilityLabel={copy.voiceLabel}>
            <VoiceRow
              label={copy.phoneDefault}
              selected={!known || voice == null}
              first
              onPress={() => set({ voice: null })}
            />
            {voices.map((v) => (
              <VoiceRow
                key={v.name}
                label={v.label}
                selected={v.name === voice}
                first={false}
                onPress={() => set({ voice: v.name })}
              />
            ))}
          </View>
          {voices.length === 0 ? (
            <Text variant="helper" tone="muted">
              {copy.noVoices}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Label>{copy.speedLabel}</Label>
          <Segmented
            options={SPEECH_RATES.map((r) => ({ value: r, label: copy.speed(r) }))}
            value={rate}
            onChange={(next) => set({ rate: next })}
            label={copy.speedLabel}
          />
          <View style={styles.test}>
            <SmallPill label={copy.test} icon={Volume2} onPress={test} />
          </View>
        </View>

        <View style={styles.section}>
          <Label>{copy.recognitionLabel}</Label>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text variant="body">{recognitionLabel(true)}</Text>
            </View>
          </View>
        </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { opacity: 0.7 },
  flex: { flex: 1, minWidth: 0 },
  test: { flexDirection: 'row' },
});
