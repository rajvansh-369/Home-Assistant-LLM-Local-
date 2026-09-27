// 2.2 Unlock (first-run plan §4.6), shared by first-run mode (unlock-owner) and profile mode
// (unlock/[id]): avatar, name, role badge, PIN dots, message line, keypad and the lockout note.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, BackButton, Keypad, PinDots, Screen, Text } from '@/components';
import { SignedOutError } from '@/features/first-run/actions';
import { common, unlock as copy } from '@/features/first-run/copy';
import { useCountdown } from '@/features/first-run/useCountdown';
import { PIN_LENGTH } from '@/features/first-run/validators';
import { ApiError } from '@/services/api';
import { getBiometricPin } from '@/services/secure';
import { colors, motion, radii, sizes, spacing, type ProfileColor } from '@/theme';

type Message = { kind: 'hint' } | { kind: 'accepted' } | { kind: 'error'; text: string };

type UnlockViewProps = {
  name: string;
  color: ProfileColor;
  /** The badge under the name: "Owner", "Member", … */
  badge: string;
  onBack: () => void;
  /** Sends the PIN. Throws ApiError (422 wrong PIN, 429 locked) or SignedOutError. */
  unlock: (pin: string) => Promise<void>;
  /** After "PIN accepted" has shown for a moment. */
  onUnlocked: () => void;
  /** A 401 signed the phone out; the screen should go to 1.2. */
  onSignedOut: () => void;
  /** This phone holds the PIN behind biometrics: show the fingerprint key and its hint. */
  fingerprint: boolean;
};

export function UnlockView({
  name,
  color,
  badge,
  onBack,
  unlock,
  onUnlocked,
  onSignedOut,
  fingerprint,
}: UnlockViewProps) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>({ kind: 'hint' });
  const [shakeKey, setShakeKey] = useState(0);
  const lock = useCountdown();
  const continueTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(continueTimer.current), []);

  const accepted = message.kind === 'accepted';
  const keypadDisabled = busy || accepted || lock.running;

  async function submit(value: string) {
    setBusy(true);
    try {
      await unlock(value);
      setMessage({ kind: 'accepted' });
      continueTimer.current = setTimeout(onUnlocked, motion.unlockContinueMs);
    } catch (e) {
      setPin('');
      if (e instanceof SignedOutError) {
        onSignedOut();
      } else if (e instanceof ApiError && e.status === 429) {
        // The line shows the countdown while locked, then falls back to the hint.
        lock.start(e.retryAfter ?? 30);
        setMessage({ kind: 'hint' });
      } else if (e instanceof ApiError && e.status === 422) {
        setShakeKey((k) => k + 1);
        setMessage({ kind: 'error', text: copy.wrongPin });
      } else if (e instanceof ApiError && e.status === 0) {
        setMessage({ kind: 'error', text: common.noConnection });
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
            text: fingerprint ? copy.fingerprintHint : '',
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
        <Avatar color={color} name={name} small />
        <Text variant="name" style={styles.name} accessibilityRole="header">
          {name}
        </Text>
        <View style={styles.badge}>
          <Text variant="badge" tone="accent" accessibilityLabel={badge}>
            {badge}
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
          onFingerprint={fingerprint ? onFingerprint : undefined}
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
