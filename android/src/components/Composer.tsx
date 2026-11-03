import { ArrowUp, Globe, House, Mic, Square } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { chat as copy } from '@/features/chat/copy';
import { voice as voiceCopy } from '@/features/voice/copy';
import {
  colors,
  iconSizes,
  maxFontSizeMultiplier,
  radii,
  sizes,
  spacing,
  strokes,
  typography,
} from '@/theme';

import { Text } from './Text';

type ComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Shown instead of Send while an answer streams. */
  onStop?: () => void;
  streaming?: boolean;
  placeholder?: string;
  /** Chat can't be used right now: a dashed pill with this reason replaces the input (3.2). */
  unavailable?: string | null;
  /** The per-message web switch (3.5); left out for Restricted and Guest. */
  web?: { on: boolean; onToggle: () => void };
  /** 3.4's "Talk instead": the mic inside the field, opening 3.6 (voice plan §3). */
  onTalk?: () => void;
};

/** The 3.4 composer: web chip, message field and Send (Stop while streaming). */
export const Composer = forwardRef<TextInput, ComposerProps>(function Composer(
  {
    value,
    onChangeText,
    onSend,
    onStop,
    streaming = false,
    placeholder = copy.placeholder,
    unavailable,
    web,
    onTalk,
  },
  ref,
) {
  if (unavailable) {
    return (
      <View style={styles.bar}>
        <View
          style={styles.unavailable}
          accessible
          accessibilityRole="text"
          accessibilityLabel={unavailable}
        >
          <House size={iconSizes.search} color={colors.textMuted} strokeWidth={strokes.icon} />
          <Text variant="body" tone="muted" numberOfLines={1} style={styles.flex}>
            {unavailable}
          </Text>
        </View>
      </View>
    );
  }

  const canSend = value.trim() !== '' && !streaming;
  const webLabel = web ? copy.webLabel(web.on) : '';
  return (
    <View style={styles.bar}>
      {web ? (
        <Pressable
          onPress={web.onToggle}
          accessibilityRole="switch"
          accessibilityLabel={copy.webA11y(webLabel)}
          accessibilityState={{ checked: web.on }}
          style={[styles.webChip, web.on && styles.webChipOn]}
        >
          <Globe
            size={iconSizes.status}
            color={web.on ? colors.accent : colors.textMuted}
            strokeWidth={strokes.icon}
          />
          <Text variant="chip" style={{ color: web.on ? colors.accent : colors.textMuted }}>
            {webLabel}
          </Text>
        </Pressable>
      ) : null}
      <View style={[styles.field, onTalk && styles.fieldWithTalk]}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={placeholder}
          style={[styles.input, onTalk && styles.inputWithTalk]}
          multiline
          maxFontSizeMultiplier={maxFontSizeMultiplier}
          submitBehavior="submit"
          returnKeyType="send"
          onSubmitEditing={canSend ? onSend : undefined}
        />
        {onTalk ? (
          <Pressable
            onPress={onTalk}
            disabled={streaming}
            accessibilityRole="button"
            accessibilityLabel={voiceCopy.talkInstead}
            accessibilityState={{ disabled: streaming }}
            style={[styles.talk, streaming && styles.sendDisabled]}
          >
            <Mic size={iconSizes.back} color={colors.textSecondary} strokeWidth={strokes.icon} />
          </Pressable>
        ) : null}
      </View>
      {streaming && onStop ? (
        <Pressable
          onPress={onStop}
          accessibilityRole="button"
          accessibilityLabel={copy.stop}
          style={[styles.send, styles.stop]}
        >
          <Square
            size={iconSizes.status}
            color={colors.text}
            fill={colors.text}
            strokeWidth={strokes.icon}
          />
        </Pressable>
      ) : (
        <Pressable
          onPress={onSend}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={copy.send}
          accessibilityState={{ disabled: !canSend }}
          style={[styles.send, !canSend && styles.sendDisabled]}
        >
          <ArrowUp size={iconSizes.send} color={colors.bg} strokeWidth={2.2} />
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 10,
    paddingBottom: 18,
    paddingHorizontal: spacing.composerX,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  webChip: {
    height: sizes.sendButton,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  webChipOn: { borderColor: colors.accentBorder, backgroundColor: colors.accentTint },
  field: {
    flex: 1,
    minWidth: 0,
    minHeight: sizes.chatInput,
    borderRadius: radii.composer,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    paddingLeft: 16,
    paddingRight: 12,
  },
  inputWithTalk: { flex: 1, minWidth: 0 },
  fieldWithTalk: { flexDirection: 'row', alignItems: 'flex-end', paddingRight: 2 },
  talk: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  input: {
    ...typography.body,
    color: colors.text,
    maxHeight: 120,
    paddingVertical: 12,
  },
  send: {
    width: sizes.sendButton,
    height: sizes.sendButton,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendDisabled: { opacity: 0.4 },
  stop: { backgroundColor: colors.track, borderWidth: 1, borderColor: colors.borderStrong },
  unavailable: {
    flex: 1,
    height: sizes.composerEntry,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
});
