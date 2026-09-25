// 1.3 Create Owner (plan §4.3). After the Owner exists this becomes "Save profile" (PATCH).
import * as LocalAuthentication from 'expo-local-authentication';
import { router, useFocusEffect } from 'expo-router';
import { Clock, Fingerprint } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import {
  Avatar,
  PrimaryButton,
  Screen,
  StepHeader,
  SwatchPicker,
  Text,
  TextField,
  TitleBlock,
  ToggleCard,
  ToggleRow,
} from '@/components';
import {
  canOpenCreateOwner,
  createOwner,
  RegisterRejectedError,
  saveOwner,
  SignedOutError,
} from '@/features/first-run/actions';
import { common, createOwner as copy } from '@/features/first-run/copy';
import { errorMessage } from '@/features/first-run/errors';
import { useFirstRunStore } from '@/features/first-run/store';
import { useStepBack } from '@/features/first-run/useStepBack';
import { isValidName, isValidPin, sanitizePin } from '@/features/first-run/validators';
import { ApiError } from '@/services/api';
import { spacing, type ProfileColor } from '@/theme';

const NAME_MAX = 40;

async function fingerprintAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export default function CreateOwner() {
  const onBack = useStepBack('/sign-in');
  const saved = useFirstRunStore.getState();
  const owner = useFirstRunStore((state) => state.owner);
  const editing = owner != null;

  const [name, setName] = useState(saved.owner?.name ?? '');
  const [color, setColor] = useState<ProfileColor>(saved.owner?.color ?? 'mint');
  const [pin, setPin] = useState('');
  const [fingerprint, setFingerprint] = useState(saved.fingerprintEnabled);
  const [canUseFingerprint, setCanUseFingerprint] = useState<boolean | null>(null);
  const [lockWhenLeave, setLockWhenLeave] = useState(saved.lockWhenLeave);
  const [busy, setBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pinRef = useRef<TextInput>(null);

  // Register mode keeps the credentials in memory only; after a restart they're gone (plan §5).
  useFocusEffect(
    useCallback(() => {
      if (!canOpenCreateOwner()) router.replace('/sign-in');
    }, []),
  );

  useEffect(() => {
    let active = true;
    fingerprintAvailable().then((available) => {
      if (!active) return;
      setCanUseFingerprint(available);
      if (!available) setFingerprint(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const canSubmit = isValidName(name) && (editing || isValidPin(pin));

  async function submit() {
    if (!canSubmit || busy) return;
    setError(null);
    setNameError(null);
    setPinError(null);
    setBusy(true);
    try {
      const input = { name, color, fingerprint, lockWhenLeave };
      const route = editing ? await saveOwner(input) : await createOwner({ ...input, pin });
      // A cancelled biometric prompt turns fingerprint off without blocking (plan §4.3).
      setFingerprint(useFirstRunStore.getState().fingerprintEnabled);
      router.push(route);
    } catch (e) {
      if (e instanceof RegisterRejectedError) router.dismissTo('/sign-in');
      else if (e instanceof SignedOutError) router.replace('/sign-in');
      else if (e instanceof ApiError && e.status === 422 && e.fieldErrors.name) {
        setNameError(e.messageFor('name'));
      } else if (e instanceof ApiError && e.status === 422 && e.fieldErrors.pin) {
        setPinError(e.messageFor('pin'));
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  const noHardware = canUseFingerprint === false;
  // Edit mode can't store the PIN (it isn't typed again), so fingerprint can only be turned off.
  const fingerprintLater = editing && !saved.fingerprintEnabled;

  return (
    <Screen
      gap={spacing.gapCreateOwner}
      header={<StepHeader step={2} onBack={onBack} />}
      footer={
        <>
          {error ? (
            <Text variant="status" tone="danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <PrimaryButton
            label={editing ? copy.save : copy.submit}
            onPress={submit}
            disabled={!canSubmit}
            busy={busy}
          />
        </>
      }
    >
      <TitleBlock title={copy.title} subtitle={copy.subtitle} />

      <View style={styles.identity}>
        <Avatar color={color} name={name} />
        <View style={styles.colourColumn}>
          <Text variant="label" tone="secondary">
            {common.profileColour}
          </Text>
          <SwatchPicker value={color} onChange={setColor} />
        </View>
      </View>

      <TextField
        label={copy.nameLabel}
        placeholder={copy.namePlaceholder}
        value={name}
        onChangeText={(text) => {
          setName(text);
          setNameError(null);
        }}
        autoCapitalize="words"
        autoComplete="name"
        maxLength={NAME_MAX}
        returnKeyType={editing ? 'done' : 'next'}
        submitBehavior={editing ? 'blurAndSubmit' : 'submit'}
        onSubmitEditing={editing ? undefined : () => pinRef.current?.focus()}
        error={nameError ?? undefined}
      />
      <TextField
        ref={pinRef}
        label={copy.pinLabel}
        variant="pin"
        value={pin}
        onChangeText={(text) => {
          setPin(sanitizePin(text));
          setPinError(null);
        }}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        autoComplete="off"
        importantForAutofill="no"
        textContentType="none"
        editable={!editing}
        helper={editing ? copy.pinLocked : copy.pinHelper}
        error={pinError ?? undefined}
      />
      <ToggleCard>
        <ToggleRow
          icon={Fingerprint}
          title={copy.fingerprint}
          subtitle={
            noHardware ? copy.noFingerprint : fingerprintLater ? copy.fingerprintLater : undefined
          }
          value={fingerprint}
          onValueChange={setFingerprint}
          disabled={noHardware || fingerprintLater}
        />
        <ToggleRow
          icon={Clock}
          title={copy.lockWhenLeave}
          subtitle={copy.lockWhenLeaveSubtitle}
          value={lockWhenLeave}
          onValueChange={setLockWhenLeave}
        />
      </ToggleCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.avatarRowGap },
  colourColumn: { gap: spacing.swatchColumnGap },
});
