// 3.6 Voice (docs/aster-voice-plan.md §3): the state line, the orb, what you said in large type,
// the answer under it (also spoken), and the bottom row: Switch to typing, the mic, Mute. Opened by
// 3.1's mic and 3.4's "Talk instead"; it starts listening at once when voice can answer.
import { Keyboard, Mic, Pause, Volume2, VolumeX, X } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AsterOrb, PulseDot, Text, TextLink } from '@/components';
import { useFirstRunStore } from '@/features/first-run/store';
import { colors, iconSizes, orbColors, radii, sizes, spacing, strokes } from '@/theme';

import { useVoiceAccess } from './access';
import { voice as copy } from './copy';
import { openAppSettings } from './mic';
import { useVoiceTurn, type VoicePhase } from './turn';

type VoiceScreenProps = {
  /** A saved chat to continue; null starts a new one. */
  chatUuid: string | null;
  onClose: () => void;
  /** Opens 3.4 with this conversation (null: no question asked yet). */
  onSwitchToTyping: (chatUuid: string | null) => void;
};

function StateLine({ phase, ready }: { phase: VoicePhase; ready: boolean }) {
  if (!ready) {
    return (
      <Text variant="statusStrong" tone="muted" accessibilityLiveRegion="polite">
        {copy.notHome}
      </Text>
    );
  }
  if (phase === 'listening') {
    return (
      <View style={styles.stateRow} accessible accessibilityLiveRegion="polite">
        <PulseDot tone="ready" />
        <Text variant="statusStrong" style={styles.accent}>
          {copy.listening}
        </Text>
      </View>
    );
  }
  const label =
    phase === 'thinking' ? copy.thinking : phase === 'speaking' ? copy.speaking : copy.paused;
  return (
    <Text variant="statusStrong" tone="muted" accessibilityLiveRegion="polite">
      {label}
    </Text>
  );
}

function SideButton({
  icon: Icon,
  label,
  onPress,
  selected,
}: {
  icon: typeof Mic;
  label: string;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected == null ? undefined : { selected }}
      style={({ pressed }) => [styles.side, pressed && styles.sidePressed]}
    >
      <Icon size={iconSizes.voiceSide} color={colors.text} strokeWidth={strokes.icon} />
    </Pressable>
  );
}

export function VoiceScreen({ chatUuid, onClose, onSwitchToTyping }: VoiceScreenProps) {
  const { ready } = useVoiceAccess();
  const name = useFirstRunStore((state) => state.session?.profile.name ?? '');
  const turn = useVoiceTurn({ chatUuid, ready });
  const listening = turn.phase === 'listening';

  // Opening 3.6 is the request to talk: listen at once.
  useEffect(() => {
    if (ready) void turn.start();
    // Only on opening; later starts come from the mic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="voiceTitle" tone="muted" accessibilityRole="header">
            {copy.title}
          </Text>
          <Text variant="monoSmall" tone="muted" numberOfLines={1}>
            {`· ${name}`}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={copy.close}
          style={({ pressed }) => [styles.close, pressed && styles.sidePressed]}
        >
          <X size={iconSizes.back} color={colors.text} strokeWidth={strokes.icon} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.state}>
          <StateLine phase={turn.phase} ready={ready} />
        </View>
        <View style={styles.orb}>
          <AsterOrb variant="voice" still={!listening} />
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.words}>
          {turn.heard ? (
            <Text variant="voiceHeard" style={styles.center}>
              {copy.quoted(turn.heard)}
            </Text>
          ) : null}
          {turn.answer ? (
            <Text variant="voiceAnswer" tone="secondary" style={styles.center}>
              {turn.answer}
            </Text>
          ) : null}
          {turn.notice ? (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <Text variant="voiceAnswer" tone="secondary" style={styles.center}>
                {turn.notice.text}
              </Text>
              {turn.notice.settings ? (
                <TextLink label={copy.openSettings} onPress={openAppSettings} />
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.controls}>
          <SideButton
            icon={Keyboard}
            label={copy.switchToTyping}
            onPress={() => onSwitchToTyping(turn.chatUuid)}
          />
          <Pressable
            onPress={turn.toggleMic}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityLabel={listening ? copy.pauseListening : copy.startListening}
            accessibilityState={{ disabled: !ready }}
            style={({ pressed }) => [
              styles.mic,
              pressed && styles.micPressed,
              !ready && styles.disabled,
            ]}
          >
            {listening ? (
              <Pause size={iconSizes.voiceMic} color={colors.bg} strokeWidth={2.4} />
            ) : (
              <Mic size={iconSizes.voiceMic} color={colors.bg} strokeWidth={2.2} />
            )}
          </Pressable>
          <SideButton
            icon={turn.muted ? VolumeX : Volume2}
            label={turn.muted ? copy.unmute : copy.mute}
            onPress={turn.toggleMute}
            selected={turn.muted}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1, alignSelf: 'stretch' },
  header: {
    height: sizes.header,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: spacing.screenX,
    paddingRight: 12,
  },
  headerText: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  close: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, alignItems: 'center', paddingTop: 8, paddingHorizontal: 24, paddingBottom: 20 },
  state: { height: 24, alignItems: 'center', justifyContent: 'center' },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accent: { color: colors.accent },
  orb: { marginTop: 18 },
  words: { paddingTop: 26, gap: 16, alignItems: 'center' },
  center: { textAlign: 'center' },
  notice: { alignItems: 'center', gap: 4 },
  controls: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
  side: {
    width: sizes.voiceSideButton,
    height: sizes.voiceSideButton,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidePressed: { backgroundColor: colors.surface2 },
  mic: {
    width: sizes.voiceMic,
    height: sizes.voiceMic,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 0 36px ${orbColors.micGlow}`,
  },
  micPressed: { backgroundColor: colors.accentPressed },
  disabled: { opacity: 0.4 },
});
