// 4.2's actions (docs/aster-messages-alerts-plan.md §3 4.2, §5 Other events): Send through the
// source app's Reply action, with `reply_sent` for Laravel (a VIP's name, never the text), and the
// star that adds or turns off the sender's VIP contact.
import { useFirstRunStore } from '@/features/first-run/store';
import { queueEvents } from '@/features/location/uploads';
import { apiTime } from '@/features/reminders/format';
import { uuidV4 } from '@/services/uuid';

import AsterSystem, { type CapturedThread } from '../../../modules/aster-system';

import { saveVip, setVipEnabled, useAlertsStore } from './alerts';
import { activity, sources } from './copy';
import { threadVip, vipForTitle } from './vip';

export type SendResult = 'sent' | 'no-action' | 'failed';

/** Sends `text` through the thread's notification. Nothing is sent any other way. */
export async function sendReply(thread: CapturedThread, text: string): Promise<SendResult> {
  const body = text.trim();
  if (!body) return 'failed';
  let result: SendResult;
  try {
    result = await AsterSystem.sendReply(thread.key, body);
  } catch {
    return 'failed';
  }
  if (result === 'sent') {
    const vip = threadVip(thread, useAlertsStore.getState().vips);
    const source = sources[thread.source];
    void queueEvents([
      {
        client_uuid: uuidV4(),
        profile_id: useFirstRunStore.getState().session?.profile.id ?? null,
        type: 'reply_sent',
        summary: vip ? activity.replied(vip.name, source) : activity.repliedUnnamed(source),
        meta: { source: thread.source },
        occurred_at: apiTime(new Date()),
      },
    ]).catch(() => {});
  }
  return result;
}

/** A one-to-one chat's VIP contact on its app, enabled or not. */
export function vipOfThread(thread: CapturedThread) {
  if (thread.isGroup) return null;
  return vipForTitle(useAlertsStore.getState().vips, thread.source, thread.title);
}

/**
 * The 4.2 star: turns the sender's VIP contact on or off, or adds one named as the chat is
 * (name and match key both the chat's title, on this app). Resolves false when Laravel refused.
 */
export async function toggleVip(thread: CapturedThread): Promise<boolean> {
  if (thread.isGroup) return false;
  const existing = vipOfThread(thread);
  if (existing) return setVipEnabled(existing.id, !existing.enabled);
  try {
    await saveVip(null, {
      name: thread.title.slice(0, 60),
      match_key: thread.title.slice(0, 120),
      sources: [thread.source],
      enabled: true,
    });
    return true;
  } catch {
    return false;
  }
}
