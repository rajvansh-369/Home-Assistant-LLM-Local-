// 2.2 Unlock, first-run mode. Phase 2 placeholder: a PIN field instead of the keypad.
// Phase 4 builds the full screen (plan §4.6).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, BackButton, Screen, Text, TextField } from '@/components';
import { SignedOutError, unlockOwner } from '@/features/first-run/actions';
import { common, unlock as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { useStepBack } from '@/features/first-run/useStepBack';
import { ApiError } from '@/services/api';
import { sizes, spacing } from '@/theme';

const CONTINUE_DELAY_MS = 600;

export default function UnlockOwner() {
  const onBack = useStepBack('/sign-in');
  const owner = useFirstRunStore((state) => state.owner);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedFor, setLockedFor] = useState(0);
  const continueTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useFocusEffect(
    useCallback(() => {
      if (!useFirstRunStore.getState().owner) router.replace('/sign-in');
    }, []),
  );

  useEffect(() => () => clearTimeout(continueTimer.current), []);

  useEffect(() => {
    if (lockedFor <= 0) return;
    const timer = setTimeout(() => setLockedFor(lockedFor - 1), 1000);
    return () => clearTimeout(timer);
  }, [lockedFor]);

  async function submit(value: string) {
    setError(null);
    setBusy(true);
    try {
      const route = await unlockOwner(value);
      setAccepted(true);
      continueTimer.current = setTimeout(() => router.push(route), CONTINUE_DELAY_MS);
    } catch (e) {
      setPin('');
      if (e instanceof SignedOutError) router.replace('/sign-in');
      else if (e instanceof ApiError && e.status === 429) setLockedFor(e.retryAfter ?? 30);
      else if (e instanceof ApiError && e.status === 422) setError(copy.wrongPin);
      else setError(common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  function onChangePin(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setPin(digits);
    if (digits.length === 6) submit(digits);
  }

  const status = accepted
    ? { tone: 'accent' as const, text: copy.accepted, icon: 'check' as const }
    : lockedFor > 0
      ? { tone: 'danger' as const, text: copy.locked(lockedFor) }
      : busy
        ? { tone: 'muted' as const, text: copy.fingerprintHint, icon: 'spinner' as const }
        : undefined;

  return (
    <Screen
      header={
        <View style={styles.backRow}>
          <BackButton onPress={onBack} />
        </View>
      }
      footer={
        <Text variant="helper" tone="muted" style={styles.center}>
          {copy.lockNote}
        </Text>
      }
    >
      <View style={styles.identity}>
        <Avatar color={owner?.color ?? 'mint'} name={owner?.name ?? ''} small />
        <Text variant="name">{owner?.name}</Text>
        <Text variant="badge" tone="accent">
          {copy.ownerBadge}
        </Text>
      </View>
      <TextField
        label={copy.prompt}
        variant="pin"
        value={pin}
        onChangeText={onChangePin}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        autoComplete="off"
        importantForAutofill="no"
        editable={!busy && !accepted && lockedFor <= 0}
        status={status}
        error={error ?? undefined}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: { height: sizes.header, justifyContent: 'center', paddingHorizontal: spacing.headerX },
  identity: { alignItems: 'center', gap: spacing.footerGap },
  center: { textAlign: 'center' },
});
