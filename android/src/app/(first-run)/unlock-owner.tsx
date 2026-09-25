// 2.2 Unlock, first-run mode (plan §4.6): used when sign-in finds an existing Owner, or after a
// restart once the Owner exists but home isn't saved. No step header; back returns to 1.2.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, BackButton, Keypad, PinDots, Screen, Text } from '@/components';
import { SignedOutError, unlockOwner } from '@/features/first-run/actions';
import { common, unlock as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { useCountdown } from '@/features/first-run/useCountdown';
import { useStepBack } from '@/features/first-run/useStepBack';
import { PIN_LENGTH } from '@/features/first-run/validators';
import { ApiError } from '@/services/api';
import { getBiometricPin } from '@/services/secure';
import { colors, motion, radii, sizes, spacing } from '@/theme';

type Message = { kind: 'hint' } | { kind: 'accepted' } | { kind: 'error'; text: string };

export default function UnlockOwner() {
  const onBack = useStepBack('/sign-in');
  const owner = useFirstRunStore((state) => state.owner);
  const fingerprintEnabled = useFirstRunStore((state) => state.fingerprintEnabled);

  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>({ kind: 'hint' });
  const [shakeKey, setShakeKey] = useState(0);
  const lock = useCountdown();
  const continueTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useFocusEffect(
    useCallback(() => {
      if (!useFirstRunStore.getState().owner) router.replace('/sign-in');
    }, []),
  );

  useEffect(() => () => clearTimeout(continueTimer.current), []);

  const accepted = message.kind === 'accepted';
  const keypadDisabled = busy || accepted || lock.running;

  async function submit(value: string) {
    setBusy(true);
    try {
      const route = await unlockOwner(value);
      setMessage({ kind: 'accepted' });
      continueTimer.current = setTimeout(() => router.push(route), motion.unlockContinueMs);
    } catch (e) {
      setPin('');
      if (e instanceof SignedOutError) {
        router.replace('/sign-in');
      } else if (e instanceof ApiError && e.status === 429) {
        // The line shows the countdown while locked, then falls back to the hint.
        lock.start(e.retryAfter ?? 30);
        setMessage({ kind: 'hint' });
      } else if (e instanceof ApiError && e.status === 422) {
        setShakeKey((k) => k + 1);
        setMessage({ kind: 'error', text: copy.wrongPin });
      } else {
        setMessage({ kind: 'error', text: common.somethingWrong });
      }
    } finally {
      setBusy(false);
    }
  }

  function onDigit(digit: string) {
    if (keypadDisabled || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (message.kind === 'error') setMessage({ kind: 'hint' });
    if (next.length === PIN_LENGTH) submit(next);
  }

  function onDelete() {
    if (keypadDisabled) return;
    setPin((p) => p.slice(0, -1));
  }

  async function onFingerprint() {
    if (keypadDisabled) return;
    try {
      const stored = await getBiometricPin();
      if (stored) {
        setPin(stored);
        await submit(stored);
      }
    } catch {
      // Prompt cancelled or key invalidated: the keypad still works.
    }
  }

  const line = lock.running
    ? { tone: 'danger' as const, variant: 'hint' as const, text: copy.locked(lock.remaining) }
    : message.kind === 'accepted'
      ? { tone: 'accent' as const, variant: 'statusStrong' as const, text: copy.accepted }
      : message.kind === 'error'
        ? { tone: 'danger' as const, variant: 'hint' as const, text: message.text }
        : // No stored biometric PIN: no fingerprint key, so no hint pointing at it.
          {
            tone: 'muted' as const,
            variant: 'hint' as const,
            text: fingerprintEnabled ? copy.fingerprintHint : '',
          };

  return (
    <Screen
      gap={0}
      contentStyle={styles.column}
      header={
        <View style={styles.backRow}>
          <BackButton onPress={onBack} />
        </View>
      }
      footer={
        <Text variant="helper" tone="muted" style={[styles.center, styles.lockNote]}>
          {copy.lockNote}
        </Text>
      }
    >
      <View style={styles.identity}>
        <Avatar color={owner?.color ?? 'mint'} name={owner?.name ?? ''} small />
        <Text variant="name" style={styles.name} accessibilityRole="header">
          {owner?.name}
        </Text>
        <View style={styles.badge}>
          <Text variant="badge" tone="accent" accessibilityLabel={copy.ownerBadge}>
            {copy.ownerBadge}
          </Text>
        </View>
      </View>

      <Text variant="prompt" tone="secondary" style={[styles.center, styles.prompt]}>
        {copy.prompt}
      </Text>

      <View style={styles.dots}>
        <PinDots
          filled={pin.length}
          shakeKey={shakeKey}
          accessibilityLabel={copy.digitsEntered(pin.length)}
        />
      </View>

      <View style={styles.line} accessibilityLiveRegion="polite">
        <Text variant={line.variant} tone={line.tone} style={styles.center}>
          {line.text}
        </Text>
      </View>

      <View style={styles.keypad}>
        <Keypad
          onDigit={onDigit}
          onDelete={onDelete}
          onFingerprint={fingerprintEnabled ? onFingerprint : undefined}
          disabled={keypadDisabled}
          fingerprintLabel={copy.fingerprintKey}
          deleteLabel={copy.deleteKey}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { height: sizes.header, justifyContent: 'center', paddingHorizontal: spacing.headerX },
  column: {
    paddingHorizontal: spacing.unlockX,
    paddingTop: spacing.unlockTop,
    paddingBottom: spacing.unlockBottom,
  },
  identity: { alignItems: 'center' },
  name: { marginTop: spacing.unlockNameTop },
  badge: {
    marginTop: spacing.unlockBadgeTop,
    minHeight: sizes.badgeHeight,
    paddingHorizontal: spacing.badgeX,
    borderRadius: radii.badge,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentTint,
    justifyContent: 'center',
  },
  prompt: { marginTop: spacing.unlockPromptTop },
  dots: { marginTop: spacing.unlockDotsTop },
  line: { marginTop: spacing.unlockLineTop, minHeight: sizes.unlockLine, justifyContent: 'center' },
  keypad: { marginTop: spacing.unlockKeypadTop },
  center: { textAlign: 'center' },
  // Short phones: the keypad pushes the note down, so it needs its own space above it.
  lockNote: { paddingTop: spacing.unlockDotsTop },
});
