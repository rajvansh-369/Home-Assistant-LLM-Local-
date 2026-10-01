// 5.2 Memory and activity (docs/aster-profiles-memory-plan.md §4 5.2), every profile but Guest:
// "Remember things about me", the notes about you with Forget and Add, learned answers with
// "Forget everything" (at home with the model ready), and the activity log with "Clear log".
// "Add a note" opens a field in place (proposed: no sheet).
import { router, useFocusEffect } from 'expo-router';
import {
  Activity as ActivityIcon,
  AlarmClock,
  Check,
  HardDrive,
  House,
  Inbox,
  LogOut,
  NotebookText,
  Plus,
  Send,
  ServerCrash,
  Trash2,
  Volume2,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  IconTile,
  PrimaryButton,
  ScreenHeader,
  StatusLine,
  Switch,
  Text,
  TextField,
  TextLink,
} from '@/components';
import { activeEngine } from '@/features/chat/ask';
import { useFirstRunStore } from '@/features/first-run/store';
import { useHomeModeStore } from '@/features/home-mode/store';
import { clock, dayLabel, sameDay } from '@/features/messages/format';
import type { Activity } from '@/services/api';
import { colors, iconSizes, radii, spacing, strokes } from '@/theme';

import { memory as copy } from './copy';
import {
  addMemoryNote,
  clearActivityLog,
  forgetEverything,
  forgetMemoryScreen,
  forgetNote,
  refreshActivity,
  refreshMemory,
  setRememberMe,
  useMemoryStore,
} from './memory';

const ICONS: Record<string, LucideIcon> = {
  spoken_alert: Volume2,
  reminder_fired: AlarmClock,
  arrived_home: House,
  left_home: LogOut,
  server_problem: ServerCrash,
  reply_sent: Send,
  memory_used: Inbox,
};

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/settings');
}

function Label({ children, style }: { children: string; style?: object }) {
  return (
    <Text variant="label" tone="secondary" accessibilityRole="header" style={style}>
      {children}
    </Text>
  );
}

function confirm(title: string, message: string, action: () => void) {
  Alert.alert(title, message, [
    { text: copy.cancel, style: 'cancel' },
    { text: title, style: 'destructive', onPress: action },
  ]);
}

function ActivityRow({ event, first }: { event: Activity; first: boolean }) {
  const Icon = ICONS[event.type] ?? ActivityIcon;
  const at = Date.parse(event.occurred_at);
  return (
    <View style={[styles.event, !first && styles.divider]} accessible>
      <Text variant="monoSmall" tone="muted" style={styles.time}>
        {clock(at)}
      </Text>
      <Icon size={iconSizes.pill} color={colors.accent} strokeWidth={strokes.icon} />
      <Text variant="bodySmall" tone="secondary" style={styles.flex}>
        {event.summary}
      </Text>
    </View>
  );
}

function ActivityLog() {
  const events = useMemoryStore((state) => state.activity);
  const loaded = useMemoryStore((state) => state.activityLoaded);
  const canClear = useMemoryStore((state) => state.canClearLog);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <View style={styles.logHeader}>
        <Label>{copy.activity}</Label>
        {canClear && events.length > 0 ? (
          <Pressable
            onPress={() =>
              confirm(copy.clearLog, copy.clearConfirm, () => {
                void clearActivityLog().then((ok) => setFailed(!ok));
              })
            }
            accessibilityRole="button"
            style={styles.clear}
          >
            <Text variant="link" tone="danger">
              {copy.clearLog}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {loaded === false ? (
        <Text variant="helper" tone="muted">
          {copy.activityFailed}
        </Text>
      ) : loaded && events.length === 0 ? (
        <Text variant="helper" tone="muted">
          {copy.noActivity}
        </Text>
      ) : events.length > 0 ? (
        <View style={styles.card}>
          {events.map((event, i) => {
            const at = Date.parse(event.occurred_at);
            const newDay = i === 0 || !sameDay(at, Date.parse(events[i - 1].occurred_at));
            return (
              <Fragment key={event.id}>
                {newDay ? (
                  <Text variant="label" tone="muted" style={[styles.day, i > 0 && styles.divider]}>
                    {dayLabel(at, copy.today)}
                  </Text>
                ) : null}
                <ActivityRow event={event} first={newDay} />
              </Fragment>
            );
          })}
        </View>
      ) : null}
      {failed ? <StatusLine status={{ tone: 'danger', text: copy.saveFailed }} /> : null}
    </>
  );
}

function Notes() {
  const notes = useMemoryStore((state) => state.notes);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save() {
    setBusy(true);
    const ok = await addMemoryNote(text);
    setBusy(false);
    setFailed(!ok);
    if (ok) {
      setText('');
      setAdding(false);
    }
  }

  return (
    <>
      <Label style={styles.sectionTop}>{copy.notes}</Label>
      {notes.length === 0 ? (
        <Text variant="helper" tone="muted">
          {copy.noNotes}
        </Text>
      ) : (
        <View style={styles.notes}>
          {notes.map((note) => (
            <View key={note.id} style={styles.note}>
              <Text variant="bodySmall" style={styles.flex}>
                {note.text}
              </Text>
              <Pressable
                onPress={() => void forgetNote(note.id).then((ok) => setFailed(!ok))}
                accessibilityRole="button"
                accessibilityLabel={copy.forget}
                accessibilityHint={note.text}
                style={styles.forget}
              >
                <X size={iconSizes.pill} color={colors.textMuted} strokeWidth={strokes.icon} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {adding ? (
        <View style={styles.addForm}>
          <TextField
            label={copy.addNote}
            value={text}
            onChangeText={setText}
            placeholder={copy.notePlaceholder}
            maxLength={500}
            autoFocus
          />
          <PrimaryButton
            label={copy.saveNote}
            icon={Check}
            onPress={() => void save()}
            busy={busy}
            disabled={!text.trim()}
          />
        </View>
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addNote, pressed && styles.pressed]}
        >
          <Plus size={iconSizes.pill} color={colors.accent} strokeWidth={strokes.icon} />
          <Text variant="link" tone="accent">
            {copy.addNote}
          </Text>
        </Pressable>
      )}
      {failed ? <StatusLine status={{ tone: 'danger', text: copy.saveFailed }} /> : null}
    </>
  );
}

function Learned() {
  const overview = useMemoryStore((state) => state.overview);
  const engines = useFirstRunStore((state) => state.engines);
  const [failed, setFailed] = useState(false);
  if (!overview) return null;
  const engine = activeEngine();
  const title =
    engine === 'markl'
      ? copy.marklCount(overview.notes, engines.find((e) => e.id === 'markl')?.name ?? 'Mark-L')
      : copy.learnedCount(overview.exchanges);
  return (
    <>
      <Label style={styles.sectionTop}>{copy.learned}</Label>
      <View style={styles.card}>
        <View style={styles.learned}>
          <IconTile icon={NotebookText} size={40} />
          <View style={styles.flex}>
            <Text variant="rowTitle">{title}</Text>
            {engine === 'local' ? (
              <Text variant="helper" tone="muted">
                {copy.ratedCount(overview.rated)}
              </Text>
            ) : null}
          </View>
        </View>
        <Pressable
          onPress={() =>
            confirm(copy.forgetAll, copy.forgetAllConfirm, () => {
              void forgetEverything().then((ok) => setFailed(!ok));
            })
          }
          accessibilityRole="button"
          style={({ pressed }) => [styles.forgetAll, pressed && styles.pressed]}
        >
          <Trash2 size={iconSizes.pill} color={colors.danger} strokeWidth={strokes.icon} />
          <Text variant="rowTitle" tone="danger">
            {copy.forgetAll}
          </Text>
        </Pressable>
      </View>
      {failed ? <StatusLine status={{ tone: 'danger', text: copy.saveFailed }} /> : null}
    </>
  );
}

export function MemoryScreen() {
  const profile = useFirstRunStore((state) => state.session?.profile);
  const ready = useHomeModeStore((state) => state.mode.kind === 'ready');
  const state = useMemoryStore((s) => s.state);
  const [switchFailed, setSwitchFailed] = useState(false);
  const enabled = profile?.memory_enabled !== false;

  useFocusEffect(
    useCallback(() => {
      void refreshActivity();
      // Leaving 5.2 takes the notes out of memory.
      return forgetMemoryScreen;
    }, []),
  );
  // Memory on opening, and again when home mode becomes ready or stops being ready.
  useEffect(() => {
    void refreshMemory();
  }, [ready]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenHeader title={copy.title} onBack={goBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.remember}>
          <IconTile icon={HardDrive} size={40} />
          <View style={styles.flex}>
            <Text variant="rowTitle">{copy.rememberMe}</Text>
            <Text variant="helper" tone="muted">
              {copy.rememberDetail(profile?.name ?? '')}
            </Text>
          </View>
          <Switch
            value={enabled}
            label={copy.rememberMe}
            onValueChange={(on) => void setRememberMe(on).then((ok) => setSwitchFailed(!ok))}
          />
        </View>
        {switchFailed ? <StatusLine status={{ tone: 'danger', text: copy.saveFailed }} /> : null}

        {state === 'ready' ? (
          <>
            <Notes />
            <Learned />
          </>
        ) : state === 'off' ? (
          <Text variant="helper" tone="muted" style={styles.sectionTop}>
            {copy.memoryOff}
          </Text>
        ) : state === 'failed' ? (
          <View style={styles.sectionTop}>
            <Text variant="helper" tone="muted">
              {copy.memoryFailed}
            </Text>
            <TextLink label={copy.retry} onPress={() => void refreshMemory()} />
          </View>
        ) : null}

        <View style={styles.sectionTop}>
          <ActivityLog />
        </View>

        {state === 'away' ? (
          <View style={styles.footnote}>
            <House size={iconSizes.pill} color={colors.textMuted} strokeWidth={strokes.icon} />
            <Text variant="helper" tone="muted" style={styles.flex}>
              {copy.atHomeOnly}
            </Text>
          </View>
        ) : null}
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
    gap: 10,
  },
  flex: { flex: 1, minWidth: 0 },
  sectionTop: { marginTop: 12, gap: 8 },
  remember: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radii.listCard,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.surface,
  },
  card: {
    borderRadius: radii.listCard,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { opacity: 0.7 },
  notes: { gap: 8 },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: radii.callout,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  forget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addNote: {
    minHeight: 48,
    borderRadius: radii.callout,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.accentBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addForm: { gap: 10 },
  learned: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  forgetAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10 },
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  time: { width: 64 },
  day: { paddingHorizontal: 16, paddingTop: 12 },
  footnote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
});
