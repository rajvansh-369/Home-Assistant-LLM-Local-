// 1.3 Create Owner. Phase 2 placeholder: the form runs the real register → create → unlock chain
// on mocks, without the fingerprint hardware check. Phase 4 builds the full screen (plan §4.3).
import { router, useFocusEffect } from 'expo-router';
import { Clock, Fingerprint } from 'lucide-react-native';
import { useCallback, useState } from 'react';

import {
  PrimaryButton,
  Screen,
  StepHeader,
  SwatchPicker,
  TextField,
  TitleBlock,
  ToggleCard,
  ToggleRow,
} from '@/components';
import { canOpenCreateOwner, createOwner, saveOwner, SignedOutError } from '@/features/first-run/actions';
import { common, createOwner as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { useStepBack } from '@/features/first-run/useStepBack';
import { ApiError } from '@/services/api';
import { spacing, type ProfileColor } from '@/theme';

export default function CreateOwner() {
  const onBack = useStepBack('/sign-in');
  const saved = useFirstRunStore.getState();
  const owner = useFirstRunStore((state) => state.owner);
  const [name, setName] = useState(saved.owner?.name ?? '');
  const [color, setColor] = useState<ProfileColor>(saved.owner?.color ?? 'mint');
  const [pin, setPin] = useState('');
  const [fingerprint, setFingerprint] = useState(saved.fingerprintEnabled);
  const [lockWhenLeave, setLockWhenLeave] = useState(saved.lockWhenLeave);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Register mode keeps the credentials in memory only; after a restart they're gone (plan §5).
  useFocusEffect(
    useCallback(() => {
      if (!canOpenCreateOwner()) router.replace('/sign-in');
    }, []),
  );

  const editing = owner != null;
  const canSubmit = name.trim() !== '' && (editing || /^\d{6}$/.test(pin));

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const input = { name, color, fingerprint, lockWhenLeave };
      router.push(editing ? await saveOwner(input) : await createOwner({ ...input, pin }));
    } catch (e) {
      if (e instanceof SignedOutError) router.replace('/sign-in');
      else setError(e instanceof ApiError ? e.message : common.somethingWrong);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      gap={spacing.gapCreateOwner}
      header={<StepHeader step={2} onBack={onBack} />}
      footer={
        <PrimaryButton
          label={editing ? copy.save : copy.submit}
          onPress={submit}
          disabled={!canSubmit}
          busy={busy}
        />
      }
    >
      <TitleBlock title={copy.title} subtitle={copy.subtitle} />
      <SwatchPicker value={color} onChange={setColor} />
      <TextField
        label={copy.nameLabel}
        placeholder={copy.namePlaceholder}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        maxLength={40}
      />
      <TextField
        label={copy.pinLabel}
        variant="pin"
        value={pin}
        onChangeText={(text) => setPin(text.replace(/\D/g, ''))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        autoComplete="off"
        importantForAutofill="no"
        editable={!editing}
        helper={editing ? copy.pinLocked : copy.pinHelper}
        error={error ?? undefined}
      />
      <ToggleCard>
        <ToggleRow
          icon={Fingerprint}
          title={copy.fingerprint}
          value={fingerprint}
          onValueChange={setFingerprint}
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
