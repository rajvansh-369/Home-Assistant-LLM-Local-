// 1.2 Sign in and register mode. Phase 2 placeholder: plain fields, no server check yet.
// Phase 3 builds the full screen (plan §4.2).
import { router } from 'expo-router';
import { useState } from 'react';

import { PrimaryButton, Screen, StepHeader, Text, TextField, TextLink, TitleBlock } from '@/components';
import { SignedOutError, signIn, startRegistration } from '@/features/first-run/actions';
import { placeholder, signIn as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { useStepBack } from '@/features/first-run/useStepBack';
import { ApiError } from '@/services/api';

const devServer = __DEV__ ? (process.env.EXPO_PUBLIC_DEV_SERVER_URL ?? '') : '';

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 422 || error.status === 401) return copy.wrongCredentials;
    if (error.status === 429) return copy.tooManyTries(error.retryAfter ?? 30);
    if (error.status === 0) return copy.unreachable;
  }
  return placeholder.somethingWrong;
}

export default function SignIn() {
  const onBack = useStepBack('/welcome');
  const saved = useFirstRunStore.getState();
  const notice = useFirstRunStore((state) => state.signInNotice);
  const [register, setRegister] = useState(false);
  const [server, setServer] = useState(saved.serverUrl ?? devServer);
  const [email, setEmail] = useState(saved.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const credentials = { server: server.trim(), email: email.trim(), password };
  const canSubmit = credentials.server !== '' && credentials.email !== '' && password !== '';

  async function submit() {
    setError(null);
    if (register) {
      router.push(startRegistration(credentials));
      return;
    }
    setBusy(true);
    try {
      router.push(await signIn(credentials));
    } catch (e) {
      setError(e instanceof SignedOutError ? copy.signInAgain : errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      header={<StepHeader step={1} onBack={onBack} />}
      footer={
        <>
          <PrimaryButton
            label={register ? copy.registerSubmit : copy.submit}
            onPress={submit}
            disabled={!canSubmit}
            busy={busy}
          />
          <TextLink
            label={register ? copy.signInLink : copy.registerLink}
            onPress={() => setRegister(!register)}
          />
        </>
      }
    >
      <TitleBlock title={register ? copy.registerTitle : copy.title} />
      {notice ? (
        <Text variant="status" tone="danger">
          {notice}
        </Text>
      ) : null}
      <TextField
        label={copy.serverLabel}
        variant="mono"
        placeholder={copy.serverPlaceholder}
        value={server}
        onChangeText={setServer}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextField
        label={copy.emailLabel}
        placeholder={copy.emailPlaceholder}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextField
        label={copy.passwordLabel}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        helper={register ? copy.passwordHelper : undefined}
        error={error ?? undefined}
      />
    </Screen>
  );
}
