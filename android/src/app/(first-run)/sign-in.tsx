// 1.2 Sign in, and register mode on the same layout (plan §4.2).
import { router, useFocusEffect } from 'expo-router';
import { Cloud } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import type { TextInput } from 'react-native';

import {
  InfoCallout,
  PrimaryButton,
  Screen,
  StepHeader,
  Text,
  TextField,
  TextLink,
  TitleBlock,
  type FieldStatus,
} from '@/components';
import { SignedOutError, signIn, startRegistration } from '@/features/first-run/actions';
import { common, signIn as copy } from '@/features/first-run/copy';
import { useFirstRunStore } from '@/features/first-run/store';
import { useServerCheck, type ServerCheck } from '@/features/first-run/useServerCheck';
import { useStepBack } from '@/features/first-run/useStepBack';
import { isValidEmail, isValidNewPassword } from '@/features/first-run/validators';
import { ApiError } from '@/services/api';
import { spacing } from '@/theme';

const devServer = __DEV__ ? (process.env.EXPO_PUBLIC_DEV_SERVER_URL ?? '') : '';

function serverStatus(check: ServerCheck): FieldStatus | undefined {
  switch (check.kind) {
    case 'checking':
      return { tone: 'muted', icon: 'spinner', text: copy.checking };
    case 'ok':
      return { tone: 'accent', icon: 'check', text: copy.reachable(check.ms) };
    case 'https':
      return { tone: 'danger', text: copy.needsHttps };
    case 'failed':
      return { tone: 'danger', text: copy.unreachable };
    default:
      return undefined;
  }
}

export default function SignIn() {
  const onBack = useStepBack('/welcome');
  const saved = useFirstRunStore.getState();
  const hasDeviceToken = useFirstRunStore((state) => state.hasDeviceToken);
  const notice = useFirstRunStore((state) => state.signInNotice);

  const [register, setRegister] = useState(false);
  const [server, setServer] = useState(saved.serverUrl ?? devServer);
  const [email, setEmail] = useState(saved.email ?? '');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { check, checkNow, markFailed } = useServerCheck(server);

  // 1.3 may send the user back here after the register call fails (plan Phase 4).
  useFocusEffect(
    useCallback(() => {
      const { signInReturn, set } = useFirstRunStore.getState();
      if (!signInReturn) return;
      set({ signInReturn: null });
      setRegister(signInReturn.mode === 'register');
      setEmailError(signInReturn.field === 'email' ? (signInReturn.message ?? null) : null);
      setPasswordError(signInReturn.field === 'password' ? (signInReturn.message ?? null) : null);
    }, []),
  );

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const trimmedEmail = email.trim();
  // Coming back after signing in: same server and email need no password (plan §5).
  const alreadySignedIn =
    !register &&
    hasDeviceToken &&
    check.kind === 'ok' &&
    check.url === saved.serverUrl &&
    trimmedEmail === saved.email;
  const canSubmit =
    check.kind === 'ok' && isValidEmail(email) && (password !== '' || alreadySignedIn);

  async function submit() {
    if (!canSubmit || busy || check.kind !== 'ok') return;
    setEmailError(null);
    setPasswordError(null);
    useFirstRunStore.getState().set({ signInNotice: null });
    const credentials = { server: check.url, email: trimmedEmail, password };

    if (register) {
      if (!isValidNewPassword(password)) {
        setPasswordError(copy.passwordHelper);
        return;
      }
      router.push(startRegistration(credentials));
      return;
    }

    setBusy(true);
    try {
      router.push(await signIn(credentials));
    } catch (error) {
      if (error instanceof SignedOutError) return; // the notice is shown above the fields
      if (error instanceof ApiError && (error.status === 422 || error.status === 401)) {
        setPasswordError(copy.wrongCredentials);
      } else if (error instanceof ApiError && error.status === 429) {
        setPasswordError(copy.tooManyTries(error.retryAfter ?? 30));
      } else if (error instanceof ApiError && error.status === 0) {
        markFailed();
      } else {
        setPasswordError(common.somethingWrong);
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    setRegister(!register);
    setEmailError(null);
    setPasswordError(null);
  }

  return (
    <Screen
      gap={spacing.gapSignIn}
      header={<StepHeader step={1} onBack={onBack} />}
      footer={
        <>
          <PrimaryButton
            label={register ? copy.registerSubmit : copy.submit}
            onPress={submit}
            disabled={!canSubmit}
            busy={busy}
          />
          <TextLink label={register ? copy.signInLink : copy.registerLink} onPress={toggleMode} />
        </>
      }
    >
      <TitleBlock title={register ? copy.registerTitle : copy.title} />
      <InfoCallout icon={Cloud} text={copy.callout} />
      {notice ? (
        <Text variant="status" tone="danger" accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}
      <TextField
        label={copy.serverLabel}
        variant="mono"
        placeholder={copy.serverPlaceholder}
        value={server}
        onChangeText={setServer}
        onBlur={checkNow}
        status={serverStatus(check)}
        valid={check.kind === 'ok'}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="url"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextField
        ref={emailRef}
        label={copy.emailLabel}
        placeholder={copy.emailPlaceholder}
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setEmailError(null);
        }}
        error={emailError ?? undefined}
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label={copy.passwordLabel}
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          setPasswordError(null);
        }}
        secureTextEntry
        autoComplete="password"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={submit}
        helper={register ? copy.passwordHelper : undefined}
        error={passwordError ?? undefined}
      />
    </Screen>
  );
}
