// expo-notifications for reminder alarms (docs/aster-reminders-location-plan.md §4): the
// `reminders` channel, the `reminder` category with Done and Snooze 30 min, and thin helpers to
// schedule, present and cancel by identifier; and the home notices of 4.4
// (docs/aster-messages-alerts-plan.md §3). Labels come from the caller's copy.
import * as Notifications from 'expo-notifications';

import { colors } from '@/theme/colors';

export const REMINDER_CHANNEL = 'reminders';
export const REMINDER_CATEGORY = 'reminder';
export const ACTION_DONE = 'done';
export const ACTION_SNOOZE = 'snooze';
/** A tap on the notification itself, not on one of its buttons. */
export const ACTION_OPEN = Notifications.DEFAULT_ACTION_IDENTIFIER;

export type NotificationLabels = { channel: string; done: string; snooze: string };

export type AlarmContent = {
  title: string;
  body: string;
  /** Android subText: whose reminder it is. */
  subtitle?: string;
  data: Record<string, string>;
};

let setUp: Promise<void> | null = null;

/** Channel, category and the foreground handler. Safe to call often; runs once per runtime. */
export function setUpNotifications(labels: NotificationLabels): Promise<void> {
  setUp ??= (async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: labels.channel,
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: colors.accent,
    });
    await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
      {
        identifier: ACTION_DONE,
        buttonTitle: labels.done,
        options: { opensAppToForeground: false },
      },
      {
        identifier: ACTION_SNOOZE,
        buttonTitle: labels.snooze,
        options: { opensAppToForeground: false },
      },
    ]);
  })().catch((error: unknown) => {
    setUp = null;
    throw error;
  });
  return setUp;
}

export async function notificationsAllowed(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Asks on Android 13+. Resolves true when notifications may be shown. */
export async function requestNotifications(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

function content({ title, body, subtitle, data }: AlarmContent) {
  return {
    title,
    body,
    subtitle: subtitle ?? null,
    data,
    categoryIdentifier: REMINDER_CATEGORY,
    color: colors.accent,
    sound: 'default' as const,
  };
}

/** Rings at `at`. Scheduling the same identifier again replaces the earlier alarm. */
export async function scheduleAlarm(identifier: string, alarm: AlarmContent, at: Date) {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: content(alarm),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: at,
      channelId: REMINDER_CHANNEL,
    },
  });
}

/** Shows now. */
export async function presentAlarm(identifier: string, alarm: AlarmContent) {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: content(alarm),
    trigger: { channelId: REMINDER_CHANNEL },
  });
}

/** Identifiers of the alarms still waiting to ring. */
export async function scheduledAlarmIds(): Promise<string[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.map((request) => request.identifier);
}

/** Stops a waiting alarm and takes a shown one off the tray. Never throws. */
export async function cancelAlarm(identifier: string) {
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  await Notifications.dismissNotificationAsync(identifier).catch(() => {});
}

// Home notices (docs/aster-messages-alerts-plan.md §3 4.4): "Welcome home" with Catch me up and
// Later, and "Home server not answering" with Retry and Settings, on their own channel.

export const HOME_CHANNEL = 'home';
export const WELCOME_CATEGORY = 'welcome';
export const SERVER_CATEGORY = 'server';
export const ACTION_CATCH_UP = 'catch-up';
export const ACTION_LATER = 'later';
export const ACTION_RETRY = 'retry';
export const ACTION_SETTINGS = 'open-settings';

export type HomeNoticeLabels = {
  channel: string;
  catchMeUp: string;
  later: string;
  retry: string;
  settings: string;
};

let homeSetUp: Promise<void> | null = null;

/** The home channel and its two categories. Safe to call often; runs once per runtime. */
export function setUpHomeNotices(labels: HomeNoticeLabels): Promise<void> {
  homeSetUp ??= (async () => {
    await Notifications.setNotificationChannelAsync(HOME_CHANNEL, {
      name: labels.channel,
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: colors.accent,
    });
    await Notifications.setNotificationCategoryAsync(WELCOME_CATEGORY, [
      {
        identifier: ACTION_CATCH_UP,
        buttonTitle: labels.catchMeUp,
        options: { opensAppToForeground: true },
      },
      {
        identifier: ACTION_LATER,
        buttonTitle: labels.later,
        options: { opensAppToForeground: false },
      },
    ]);
    await Notifications.setNotificationCategoryAsync(SERVER_CATEGORY, [
      {
        identifier: ACTION_RETRY,
        buttonTitle: labels.retry,
        options: { opensAppToForeground: false },
      },
      {
        identifier: ACTION_SETTINGS,
        buttonTitle: labels.settings,
        options: { opensAppToForeground: true },
      },
    ]);
  })().catch((error: unknown) => {
    homeSetUp = null;
    throw error;
  });
  return homeSetUp;
}

export type Notice = {
  title: string;
  body: string;
  category: typeof WELCOME_CATEGORY | typeof SERVER_CATEGORY;
  data: Record<string, string>;
};

/** Shows a home notice now; the same identifier replaces the earlier one. */
export async function presentNotice(identifier: string, notice: Notice) {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: notice.title,
      body: notice.body,
      data: notice.data,
      categoryIdentifier: notice.category,
      color: colors.accent,
    },
    trigger: { channelId: HOME_CHANNEL },
  });
}

/** Tests only. */
export function resetNotificationSetup() {
  setUp = null;
  homeSetUp = null;
}
