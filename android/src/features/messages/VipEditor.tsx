// The VIP contact editor (docs/aster-messages-alerts-plan.md §3, proposed: the canvas has only "Add
// a VIP contact"): Name, Name in notifications, the apps, and "From your messages" — recent senders
// that fill the fields. Saved on Laravel first, so its 422 shows on the fields.
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton, ScreenHeader, StatusLine, Text, TextField, TextLink } from '@/components';
import { ApiError, type MessageSource, type VipContactBody } from '@/services/api';
import { colors, radii, sizes, spacing } from '@/theme';

import { deleteVip, saveVip, useAlertsStore } from './alerts';
import { sources, vipEditor as copy } from './copy';
import { byNewest } from './format';
import { useThreadsStore } from './threads';
import { normalizeName } from './vip';

export const RECENT_SENDERS = 6;
const SOURCES: MessageSource[] = ['whatsapp', 'google_chat', 'sms'];

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/alerts');
}

/** One-to-one chats' names not already a VIP on that app, newest first. */
export function recentSenders(
  threads: ReturnType<typeof useThreadsStore.getState>['threads'],
  vips: ReturnType<typeof useAlertsStore.getState>['vips'],
): { name: string; source: MessageSource }[] {
  const taken = new Set(
    vips.flatMap((vip) => vip.sources.map((s) => `${s}:${normalizeName(vip.match_key)}`)),
  );
  return [...threads]
    .sort(byNewest)
    .filter((t) => !t.isGroup && t.title && !taken.has(`${t.source}:${normalizeName(t.title)}`))
    .slice(0, RECENT_SENDERS)
    .map((t) => ({ name: t.title, source: t.source }));
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}
    >
      <Text variant="chip" tone={selected ? 'accent' : 'secondary'} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function VipEditor({ id }: { id: number | null }) {
  const existing = useAlertsStore((state) => state.vips.find((vip) => vip.id === id) ?? null);
  const vips = useAlertsStore((state) => state.vips);
  const threads = useThreadsStore((state) => state.threads);
  const [name, setName] = useState(existing?.name ?? '');
  const [matchKey, setMatchKey] = useState(existing?.match_key ?? '');
  const [apps, setApps] = useState<MessageSource[]>(existing?.sources ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const suggestions = id == null ? recentSenders(threads, vips) : [];

  function toggleApp(source: MessageSource) {
    setApps(apps.includes(source) ? apps.filter((s) => s !== source) : [...apps, source]);
    setErrors({ ...errors, sources: '' });
  }

  async function save() {
    const body: VipContactBody = {
      name: name.trim(),
      match_key: matchKey.trim(),
      sources: SOURCES.filter((s) => apps.includes(s)),
      enabled: existing?.enabled ?? true,
    };
    const missing = {
      name: body.name ? '' : copy.nameRequired,
      match_key: body.match_key ? '' : copy.matchKeyRequired,
      sources: body.sources.length > 0 ? '' : copy.appsHelp,
    };
    if (Object.values(missing).some(Boolean)) {
      setErrors(missing);
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      await saveVip(id, body);
      goBack();
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrors({
          name: error.fieldErrors.name?.[0] ?? '',
          match_key: error.fieldErrors.match_key?.[0] ?? '',
          sources: error.fieldErrors.sources?.[0] ?? '',
        });
      } else {
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (id == null) return;
    Alert.alert(copy.delete, copy.deleteConfirm, [
      { text: copy.cancel, style: 'cancel' },
      {
        text: copy.delete,
        style: 'destructive',
        onPress: () => {
          deleteVip(id)
            .then(goBack)
            .catch(() => setFailed(true));
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenHeader title={id == null ? copy.newTitle : copy.editTitle} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {suggestions.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" tone="secondary" accessibilityRole="header">
              {copy.recent}
            </Text>
            <View style={styles.chips}>
              {suggestions.map((sender) => (
                <Chip
                  key={`${sender.source}:${sender.name}`}
                  label={`${sender.name} · ${sources[sender.source]}`}
                  selected={matchKey === sender.name && apps.includes(sender.source)}
                  onPress={() => {
                    if (!name.trim()) setName(sender.name.slice(0, 60));
                    setMatchKey(sender.name.slice(0, 120));
                    if (!apps.includes(sender.source)) setApps([...apps, sender.source]);
                    setErrors({});
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}
        <TextField
          label={copy.name}
          value={name}
          onChangeText={(text) => {
            setName(text);
            setErrors({ ...errors, name: '' });
          }}
          placeholder={copy.namePlaceholder}
          maxLength={60}
          autoCapitalize="words"
          error={errors.name || undefined}
        />
        <TextField
          label={copy.matchKey}
          value={matchKey}
          onChangeText={(text) => {
            setMatchKey(text);
            setErrors({ ...errors, match_key: '' });
          }}
          helper={copy.matchKeyHelp}
          maxLength={120}
          autoCapitalize="words"
          error={errors.match_key || undefined}
        />
        <View style={styles.section}>
          <Text variant="label" tone="secondary" accessibilityRole="header">
            {copy.apps}
          </Text>
          <View style={styles.chips}>
            {SOURCES.map((source) => (
              <Chip
                key={source}
                label={sources[source]}
                selected={apps.includes(source)}
                onPress={() => toggleApp(source)}
              />
            ))}
          </View>
          <Text variant="helper" tone={errors.sources ? 'danger' : 'muted'}>
            {errors.sources || copy.appsHelp}
          </Text>
        </View>
        {failed ? <StatusLine status={{ tone: 'danger', text: copy.saveFailed }} /> : null}
        <View style={styles.footer}>
          <PrimaryButton label={copy.save} icon={Check} onPress={save} busy={busy} />
          {id != null ? <TextLink label={copy.delete} onPress={confirmDelete} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.screenX,
    paddingTop: 8,
    paddingBottom: spacing.contentBottom,
    gap: 18,
  },
  section: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: sizes.filterChip,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  chipOn: { backgroundColor: colors.accentTint, borderColor: colors.accentBorder },
  chipOff: { backgroundColor: colors.surface, borderColor: colors.border },
  footer: { gap: spacing.footerGap, marginTop: 8 },
});
