// 2.4 Edit profile (docs/aster-profiles-memory-plan.md §4 2.4), Owner only, for Member and
// Restricted profiles, and the same screen to add one. Editing saves each change as it is made
// (`PATCH /profiles/{id}`) and puts it back if Laravel refuses; adding collects everything and
// sends `POST /profiles` once. The pickers are segmented controls (proposed: the canvas draws rows
// that open pickers), and the PIN is 1.3's PIN field.
import { router } from 'expo-router';
import { Check, Inbox, MessageCircle, NotebookText, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Avatar,
  LinkRow,
  PrimaryButton,
  ScreenHeader,
  Segmented,
  SmallPill,
  StatusLine,
  SwatchPicker,
  Text,
  TextField,
  TextLink,
  ToggleCard,
  ToggleRow,
  type FieldStatus,
} from '@/components';
import { isValidName, isValidPin, sanitizePin } from '@/features/first-run/validators';
import {
  ApiError,
  type CreateProfileBody,
  type Profile,
  type Sampling,
  type UpdateProfileBody,
  type WebMode,
} from '@/services/api';
import {
  colors,
  iconSizes,
  profileColorKey,
  profileColors,
  radii,
  spacing,
  strokes,
  type ProfileColor,
} from '@/theme';

import { profileEditor as copy } from './copy';
import {
  createHouseholdProfile,
  deleteHouseholdProfile,
  loadProfileDetails,
  saveProfileChange,
  useManageStore,
} from './manage';

const NAME_MAX = 40;
/** "After 2 min", as 1.3's "Lock when I leave". */
const AUTO_LOCK_MINUTES = 2;

type Role = 'member' | 'restricted';

/** What the form shows: a new profile's draft, or the saved profile. */
type Values = {
  name: string;
  color: string;
  role: Role;
  sampling: Sampling;
  web_mode: WebMode;
  auto_lock_minutes: number | null;
  /** Missing when Laravel doesn't have the switch: the row is hidden. */
  chat_enabled?: boolean;
  history_enabled?: boolean;
};

const NEW_PROFILE: Values = {
  name: '',
  color: profileColors.lilac,
  role: 'member',
  sampling: 'auto',
  web_mode: 'auto',
  auto_lock_minutes: AUTO_LOCK_MINUTES,
  chat_enabled: true,
  history_enabled: true,
};

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/profiles');
}

function valuesOf(profile: Profile): Values {
  return {
    name: profile.name,
    color: profile.color,
    role: profile.role === 'restricted' ? 'restricted' : 'member',
    sampling: profile.sampling ?? 'auto',
    web_mode: profile.web_mode ?? 'auto',
    auto_lock_minutes: profile.auto_lock_minutes ?? null,
    chat_enabled: profile.chat_enabled,
    history_enabled: profile.history_enabled,
  };
}

function Label({ children }: { children: string }) {
  return (
    <Text variant="label" tone="secondary" accessibilityRole="header">
      {children}
    </Text>
  );
}

export function ProfileEditor({ id }: { id: number | null }) {
  const adding = id == null;
  const saved = useManageStore((state) => (id == null ? undefined : state.details[id]));
  const [draft, setDraft] = useState<Values>(NEW_PROFILE);
  const [name, setName] = useState(saved?.name ?? '');
  const [pin, setPin] = useState('');
  const [errors, setErrors] = useState<{ name?: string; pin?: string }>({});
  const [status, setStatus] = useState<FieldStatus | null>(null);
  const [load, setLoad] = useState<'loading' | 'failed' | 'old' | 'done'>(
    adding || saved ? 'done' : 'loading',
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id == null) return;
    let active = true;
    loadProfileDetails(id)
      .then((profile) => {
        if (!active) return;
        setName((current) => current || profile.name);
        setLoad('done');
      })
      .catch((error: unknown) => {
        if (!active) return;
        // Keep showing what 2.3 already had; say so only when there's nothing.
        if (useManageStore.getState().details[id]) return;
        setLoad(error instanceof ApiError && error.status === 405 ? 'old' : 'failed');
      });
    return () => {
      active = false;
    };
  }, [id]);

  const values = adding ? draft : saved ? valuesOf(saved) : null;

  /** A change: kept in the draft, or saved at once. A refusal shows on its field. */
  async function change(patch: UpdateProfileBody & Partial<Values>) {
    setStatus(null);
    if (id == null) {
      setDraft({ ...draft, ...patch });
      return true;
    }
    try {
      await saveProfileChange(id, patch);
      return true;
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 422 &&
        (error.fieldErrors.name || error.fieldErrors.pin)
      ) {
        setErrors({ name: error.fieldErrors.name?.[0], pin: error.fieldErrors.pin?.[0] });
      } else {
        setStatus({ tone: 'danger', text: copy.saveFailed });
      }
      return false;
    }
  }

  function saveName() {
    if (adding || !saved || name.trim() === saved.name) return;
    if (!isValidName(name)) {
      setErrors({ ...errors, name: copy.nameRequired });
      return;
    }
    void change({ name: name.trim() });
  }

  async function changePin() {
    if (!isValidPin(pin)) return;
    setBusy(true);
    if (await change({ pin })) {
      setPin('');
      setStatus({ tone: 'accent', icon: 'check', text: copy.pinSaved });
    }
    setBusy(false);
  }

  async function create() {
    const missing = {
      name: isValidName(name) ? undefined : copy.nameRequired,
      pin: isValidPin(pin) ? undefined : copy.pinHelper,
    };
    if (missing.name || missing.pin) {
      setErrors(missing);
      return;
    }
    const body: CreateProfileBody = {
      name: name.trim(),
      color: draft.color,
      role: draft.role,
      pin,
      auto_lock_minutes: draft.auto_lock_minutes,
      sampling: draft.sampling,
      web_mode: draft.web_mode,
      chat_enabled: draft.chat_enabled,
      history_enabled: draft.history_enabled,
    };
    setBusy(true);
    setStatus(null);
    try {
      await createHouseholdProfile(body);
      goBack();
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrors({ name: error.fieldErrors.name?.[0], pin: error.fieldErrors.pin?.[0] });
        if (!error.fieldErrors.name && !error.fieldErrors.pin) {
          setStatus({ tone: 'danger', text: error.message });
        }
      } else {
        setStatus({ tone: 'danger', text: copy.saveFailed });
      }
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (id == null || !saved) return;
    Alert.alert(copy.delete(saved.name), copy.deleteConfirm(saved.name), [
      { text: copy.cancel, style: 'cancel' },
      {
        text: copy.deleteButton,
        style: 'destructive',
        onPress: () => {
          deleteHouseholdProfile(id)
            .then(goBack)
            .catch(() => setStatus({ tone: 'danger', text: copy.saveFailed }));
        },
      },
    ]);
  }

  const title = adding ? copy.newTitle : copy.title;

  if (!values) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <ScreenHeader title={title} onBack={goBack} />
        {load === 'loading' ? null : (
          <View style={styles.content}>
            <Text variant="body" tone="secondary">
              {load === 'old' ? copy.oldServer : copy.loadFailed}
            </Text>
            {load === 'failed' ? (
              <TextLink
                label={copy.retry}
                onPress={() => {
                  setLoad('loading');
                  void loadProfileDetails(id!)
                    .then((profile) => {
                      setName(profile.name);
                      setLoad('done');
                    })
                    .catch(() => setLoad('failed'));
                }}
              />
            ) : null}
          </View>
        )}
      </SafeAreaView>
    );
  }

  const shownName = name.trim() || values.name;
  const restricted = values.role === 'restricted';
  const minutes = values.auto_lock_minutes ?? 0;
  const lockChoices = copy.autoLocks.some((c) => c.value === minutes)
    ? copy.autoLocks
    : [{ value: minutes, label: `After ${minutes} min` }, ...copy.autoLocks];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenHeader title={title} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.identity}>
          <Avatar color={profileColorKey(values.color)} name={shownName} size="card" />
          <View style={styles.identityText}>
            <TextField
              label={copy.name}
              value={name}
              placeholder={copy.namePlaceholder}
              onChangeText={(text) => {
                setName(text);
                setErrors({ ...errors, name: undefined });
              }}
              onEndEditing={saveName}
              autoCapitalize="words"
              maxLength={NAME_MAX}
              error={errors.name}
            />
          </View>
        </View>
        <View style={styles.section}>
          <Label>{copy.colour}</Label>
          <SwatchPicker
            value={profileColorKey(values.color)}
            onChange={(key: ProfileColor) => void change({ color: profileColors[key] })}
          />
        </View>

        <View style={styles.section}>
          <Label>{copy.role}</Label>
          <Segmented<Role>
            options={copy.roles}
            value={values.role}
            onChange={(role) => void change({ role })}
            label={copy.role}
          />
          <Text variant="helper" tone="muted">
            {copy.roleHelp}
          </Text>
        </View>

        <View style={styles.section}>
          <Label>{copy.canUse(shownName)}</Label>
          <ToggleCard>
            {values.chat_enabled !== undefined ? (
              <ToggleRow
                icon={MessageCircle}
                iconTone="neutral"
                title={copy.chat}
                value={values.chat_enabled}
                onValueChange={(on) => void change({ chat_enabled: on })}
              />
            ) : null}
            {values.history_enabled !== undefined ? (
              <ToggleRow
                icon={NotebookText}
                iconTone="neutral"
                title={copy.history}
                subtitle={copy.historyDetail(shownName)}
                value={values.history_enabled}
                onValueChange={(on) => void change({ history_enabled: on })}
              />
            ) : null}
            <LinkRow
              icon={Inbox}
              title={copy.messages}
              subtitle={copy.messagesDetail}
              value={copy.ownerOnly}
            />
          </ToggleCard>
        </View>

        <View style={styles.section}>
          <Label>{copy.answers}</Label>
          <Text variant="rowTitleToggle">{copy.answerStyle}</Text>
          <Segmented<Sampling>
            options={copy.samplings}
            value={values.sampling}
            onChange={(sampling) => void change({ sampling })}
            label={copy.answerStyle}
          />
          <Text variant="rowTitleToggle" style={styles.gap}>
            {copy.web}
          </Text>
          {restricted ? (
            <Text variant="helper" tone="muted">
              {copy.webRestricted}
            </Text>
          ) : (
            <Segmented<WebMode>
              options={copy.webModes}
              value={values.web_mode}
              onChange={(web_mode) => void change({ web_mode })}
              label={copy.web}
            />
          )}
          <Text variant="rowTitleToggle" style={styles.gap}>
            {copy.autoLock}
          </Text>
          <Segmented<number>
            options={lockChoices}
            value={minutes}
            onChange={(value) => void change({ auto_lock_minutes: value === 0 ? null : value })}
            label={copy.autoLock}
          />
        </View>

        <View style={styles.section}>
          <TextField
            label={copy.pin}
            variant="pin"
            value={pin}
            onChangeText={(text) => {
              setPin(sanitizePin(text));
              setErrors({ ...errors, pin: undefined });
            }}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
            helper={copy.pinHelper}
            error={errors.pin}
          />
          {!adding ? (
            <View style={styles.pinAction}>
              <SmallPill
                label={copy.pinChange}
                icon={Check}
                onPress={() => void changePin()}
                busy={busy}
                disabled={!isValidPin(pin)}
              />
            </View>
          ) : null}
        </View>

        {status ? <StatusLine status={status} /> : null}

        {adding ? (
          <PrimaryButton
            label={copy.create}
            icon={Check}
            onPress={() => void create()}
            busy={busy}
          />
        ) : (
          <Pressable
            onPress={confirmDelete}
            accessibilityRole="button"
            accessibilityLabel={copy.delete(values.name)}
            style={({ pressed }) => [styles.delete, pressed && styles.pressed]}
          >
            <Trash2 size={iconSizes.search} color={colors.danger} strokeWidth={strokes.icon} />
            <Text variant="button" tone="danger">
              {copy.delete(values.name)}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 4,
    paddingBottom: spacing.contentBottom,
    gap: 18,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identityText: { flex: 1 },
  section: { gap: 8 },
  gap: { marginTop: 8 },
  pinAction: { flexDirection: 'row' },
  delete: {
    minHeight: 52,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerTint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pressed: { opacity: 0.7 },
});
