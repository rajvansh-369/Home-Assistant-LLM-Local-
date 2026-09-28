// 4.4's home notices (docs/aster-messages-alerts-plan.md §3 4.4, §7): on arriving home the geofence
// task checks `/health` (3 s) and posts "Welcome home" with the catch-up offer when VIPs wrote, or
// "Home server not answering" (with `server_problem` for Laravel) when the home PC doesn't reply.
// Also runs headless, so every store it needs loads itself.
import { activeEngineOf, useFirstRunStore, type FirstRunStore } from '@/features/first-run/store';
import { modeFromHealth, modelLabel } from '@/features/home-mode/mode';
import { queueEvents } from '@/features/location/uploads';
import { apiTime } from '@/features/reminders/format';
import { checkLlmHealth } from '@/services/llm/health';
import {
  ACTION_LATER,
  ACTION_RETRY,
  cancelAlarm,
  presentNotice,
  SERVER_CATEGORY,
  setUpHomeNotices,
  WELCOME_CATEGORY,
} from '@/services/notifications';
import { uuidV4 } from '@/services/uuid';

import AsterSystem from '../../../modules/aster-system';

import { ensureAlertsLoaded, useAlertsStore } from './alerts';
import { activity, notifications as copy } from './copy';
import { byNewest } from './format';
import { threadVip, unreadVipCount } from './vip';

export const WELCOME_ID = 'aster-welcome';
export const SERVER_ID = 'aster-server';
export const WELCOME_NAMES = 3;

const labels = {
  channel: copy.channel,
  catchMeUp: copy.catchMeUp,
  later: copy.later,
  retry: copy.retry,
  settings: copy.settings,
};

async function firstRunState(): Promise<FirstRunStore> {
  const persist = useFirstRunStore.persist;
  if (!persist.hasHydrated()) await persist.rehydrate();
  return useFirstRunStore.getState();
}

/** "192.168.1.20" from "http://192.168.1.20:8000". */
export const hostOf = (url: string) => url.replace(/^[a-z]+:\/\//i, '').replace(/[:/].*$/, '');

/** Unread VIP messages on the phone, and the VIPs' names, newest chat first. */
export async function missedVips(): Promise<{ count: number; names: string[] }> {
  await ensureAlertsLoaded();
  const { vips } = useAlertsStore.getState();
  const threads = await AsterSystem.listThreads().catch(() => []);
  let count = 0;
  const names: string[] = [];
  for (const thread of [...threads].sort(byNewest)) {
    const unread = unreadVipCount(thread, vips);
    if (unread === 0) continue;
    count += unread;
    const name = threadVip(thread, vips)?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  return { count, names };
}

async function welcome(state: FirstRunStore): Promise<boolean> {
  const { count, names } = await missedVips();
  if (count === 0) return false;
  await setUpHomeNotices(labels);
  const model = modelLabel(activeEngineOf(state), state.engines);
  await presentNotice(WELCOME_ID, {
    title: copy.welcomeTitle,
    body: copy.welcomeBody(model, count, names.slice(0, WELCOME_NAMES)),
    category: WELCOME_CATEGORY,
    data: { notice: 'welcome' },
  });
  await cancelAlarm(SERVER_ID);
  return true;
}

async function serverProblem(llmUrl: string, logEvent: boolean) {
  await setUpHomeNotices(labels);
  await presentNotice(SERVER_ID, {
    title: copy.serverTitle,
    body: copy.serverBody(hostOf(llmUrl)),
    category: SERVER_CATEGORY,
    data: { notice: 'server' },
  });
  if (!logEvent) return;
  await queueEvents([
    {
      client_uuid: uuidV4(),
      profile_id: null,
      type: 'server_problem',
      summary: activity.serverProblem,
      meta: {},
      occurred_at: apiTime(new Date()),
    },
  ]);
}

/**
 * Arriving home: Welcome home when the model is ready and VIPs wrote; Home server not answering
 * when the home PC doesn't reply. `retry` is the notice's Retry, which logs no second event.
 * Never throws.
 */
export async function offerHomeNotices(retry = false): Promise<'welcome' | 'server' | null> {
  try {
    const state = await firstRunState();
    if (!state.home || !state.firstRunDone) return null;
    const mode = modeFromHealth(await checkLlmHealth(state.home.llm_url), activeEngineOf(state));
    if (mode.kind === 'ready') {
      if (retry) await cancelAlarm(SERVER_ID);
      return (await welcome(state)) ? 'welcome' : null;
    }
    if (mode.kind === 'noServer') {
      await serverProblem(state.home.llm_url, !retry);
      return 'server';
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * A home notice's tap or button. Resolves with the screen to open ("Catch me up" and a tap on
 * Welcome home open 4.1; Settings and a tap on the server notice open 5.1), else null.
 */
export async function handleNoticeResponse(response: {
  actionIdentifier: string;
  notification: { request: { content: { data?: unknown } } };
}): Promise<'/messages' | '/settings' | null> {
  const data = (response.notification.request.content.data ?? {}) as { notice?: unknown };
  if (data.notice === 'welcome') {
    await cancelAlarm(WELCOME_ID);
    return response.actionIdentifier === ACTION_LATER ? null : '/messages';
  }
  if (data.notice === 'server') {
    await cancelAlarm(SERVER_ID);
    if (response.actionIdentifier !== ACTION_RETRY) return '/settings';
    await offerHomeNotices(true);
  }
  return null;
}
