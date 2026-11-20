// What the voice intents do on the phone (docs/aster-voice-plan.md §5): save a reminder through
// the reminders queue, find the missed messages to read out, and reply through the source
// notification. Who may do what is checked here too. Messages never leave the phone from here and
// are never logged; reading them out marks their chats read.
import { useFirstRunStore } from '@/features/first-run/store';
import { queueEvents } from '@/features/location/uploads';
import { sendReply, type SendResult } from '@/features/messages/actions';
import { ensureAlertsLoaded, useAlertsStore } from '@/features/messages/alerts';
import { CATCH_UP_MESSAGES, readOutText, unreadMessages, type UnreadItem } from '@/features/messages/catchup';
import { sources } from '@/features/messages/copy';
import { markThreadRead, refreshThreads, useThreadsStore } from '@/features/messages/threads';
import { threadVip } from '@/features/messages/vip';
import { addReminder, canUseReminders } from '@/features/reminders/actions';
import { uuidV4 } from '@/services/uuid';
import { apiTime, clock12, daysFrom, dueLabel } from '@/features/reminders/format';
import { reminders as reminderCopy } from '@/features/reminders/copy';

import AsterSystem, { type CapturedThread } from '../../../modules/aster-system';

import { voice as copy } from './copy';
import { nameMatches, type VoiceIntent } from './intents';

/** More unread messages than this are summed up by the local model first (plan §5). */
export const READ_OUT_AT_MOST = 3;

const role = () => useFirstRunStore.getState().session?.profile.role;

export const mayUseReminders = () => canUseReminders(role());
export const mayUseMessages = () => role() === 'owner';

/** "at 9:00 PM" / "tomorrow at 9:00 AM" / "on Friday at 9:00 AM" / "when you get home". */
export function spokenWhen(dueAt: Date | null, now: Date): string {
  if (!dueAt) return copy.remindHome;
  const time = clock12(dueAt);
  const days = daysFrom(now, dueAt);
  if (days <= 0) return copy.remindAt(time);
  if (days === 1) return copy.remindTomorrow(time);
  return copy.remindOn(copy.days[dueAt.getDay()], time);
}

export type SavedReminder = { clientUuid: string; title: string; when: string; spoken: string };

/** Saves a voice reminder (made at home: voice is home-only). Throws when it can't be saved. */
export async function saveReminder(
  intent: Extract<VoiceIntent, { kind: 'reminder' }>,
  now = new Date(),
): Promise<SavedReminder> {
  if (!intent.trigger) throw new Error('A reminder needs a when');
  const clientUuid = await addReminder(
    { title: intent.title, trigger: intent.trigger, dueAt: intent.dueAt },
    true,
    now,
  );
  const when =
    intent.trigger === 'arrive_home' || !intent.dueAt
      ? reminderCopy.whenHome
      : dueLabel(intent.dueAt.toISOString(), now);
  return {
    clientUuid,
    title: intent.title,
    when,
    spoken: copy.reminderSaved(spokenWhen(intent.trigger === 'time' ? intent.dueAt : null, now)),
  };
}

/** How a thread is spoken of: its VIP's name, else the chat's title. */
export function threadName(thread: CapturedThread): string {
  return threadVip(thread, useAlertsStore.getState().vips)?.name ?? thread.title;
}

export type MissedMessages = {
  items: UnreadItem[];
  /** All of them are from one chat: the one "Reply …" answers. */
  thread: CapturedThread | null;
};

/** The unread messages, all or from `name` (a VIP's name, a chat's title or a sender). */
export async function findMissed(name: string | null): Promise<MissedMessages> {
  await Promise.all([ensureAlertsLoaded(), refreshThreads()]);
  const { vips } = useAlertsStore.getState();
  const items = await unreadMessages(
    useThreadsStore.getState().threads,
    CATCH_UP_MESSAGES,
    name
      ? ({ thread, message }) =>
          nameMatches(name, [threadVip(thread, vips)?.name, thread.title, message.sender])
      : undefined,
  );
  const keys = new Set(items.map((item) => item.thread.key));
  return { items, thread: keys.size === 1 ? items[0].thread : null };
}

/** The messages as the alert engine's Full wording, chat after chat. */
export const readOut = (items: UnreadItem[]) =>
  readOutText(items, useAlertsStore.getState().vips);

/**
 * They have been heard: their chats are read now, and Laravel's activity log gets `voice_read` with
 * the counts (and a VIP's name when they were all one VIP's), never the text (plan §5).
 */
export async function markHeard(items: UnreadItem[], summed = false) {
  const threads = [...new Map(items.map((item) => [item.thread.key, item.thread])).values()];
  for (const thread of threads) await markThreadRead(thread.key);
  if (items.length === 0) return;
  const vip = threads.length === 1 ? threadVip(threads[0], useAlertsStore.getState().vips) : null;
  void queueEvents([
    {
      client_uuid: uuidV4(),
      profile_id: useFirstRunStore.getState().session?.profile.id ?? null,
      type: 'voice_read',
      summary: copy.activity.readOut(items.length, vip?.name ?? null),
      meta: { messages: items.length, chats: threads.length, summed },
      occurred_at: apiTime(new Date()),
    },
  ]).catch(() => {});
}

/** Reply by voice: the thread, its unread messages and the recent ones for a draft. */
export async function openThread(key: string) {
  await Promise.all([ensureAlertsLoaded(), refreshThreads()]);
  const thread = useThreadsStore.getState().threads.find((t) => t.key === key) ?? null;
  if (!thread) return null;
  const recent = await AsterSystem.threadMessages(key, 60).catch(() => []);
  const unread = recent
    .filter((message) => !message.read && !message.outgoing && !message.otp)
    .map((message) => ({ thread, message }));
  return { thread, recent, unread };
}

/** What to say after a reply was sent, or why it wasn't. */
export async function reply(thread: CapturedThread, text: string): Promise<{ result: SendResult; said: string }> {
  // The thread as it is now: its notification may have gone since it was read out.
  const fresh = useThreadsStore.getState().threads.find((t) => t.key === thread.key) ?? thread;
  const result = await sendReply(fresh, text);
  const said =
    result === 'sent'
      ? copy.replySent(threadName(fresh))
      : result === 'no-action'
        ? copy.replyGone(sources[fresh.source])
        : copy.replyFailed;
  return { result, said };
}
