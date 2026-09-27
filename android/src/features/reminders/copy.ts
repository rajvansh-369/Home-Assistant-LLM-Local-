// Reminders: "Coming up" on 3.1 / 3.2, the editor, the notification and the activity events
// (docs/aster-reminders-location-plan.md §3, §4). Canvas strings are exact; the rest are marked.

export const reminders = {
  comingUp: 'Coming up',
  /** Words in due labels: "Tomorrow 10:00" (canvas), "Today" on the editor's day pill. */
  today: 'Today', // (proposed)
  tomorrow: 'Tomorrow',
  add: 'Add', // (proposed)
  whenHome: 'When I get home',
  showAll: (count: number) => `Show all (${count})`, // (proposed)
  nothing: 'Nothing coming up', // (proposed)
  addFirst: 'Add a reminder', // (proposed)
  /** TalkBack name of a "Coming up" row. */
  rowLabel: (title: string, when: string) => `${title}, ${when}`, // (proposed)

  notification: {
    channel: 'Reminders', // (proposed) the name in Android's notification settings
    done: 'Done',
    snooze: 'Snooze 30 min',
    arriveBody: 'You asked me to remind you when you got home.',
    timeBody: (time: string) => `You asked me to remind you at ${time}.`, // (proposed)
  },

  /** What Laravel's activity log shows. Never the reminder's title. (proposed) */
  activity: {
    fired: 'Reminder rang',
  },

  editor: {
    newTitle: 'New reminder', // (proposed)
    editTitle: 'Reminder', // (proposed)
    what: 'What', // (proposed)
    whatPlaceholder: 'Call the plumber', // (proposed)
    when: 'When', // (proposed)
    atTime: 'At a time', // (proposed)
    whenHome: 'When I get home',
    inHour: 'In 1 hour', // (proposed)
    tonight: 'Tonight 9 PM', // (proposed)
    tomorrowMorning: 'Tomorrow 9 AM', // (proposed)
    day: 'Day', // (proposed) TalkBack
    time: 'Time', // (proposed) TalkBack
    homeHelp: 'Rings when you arrive home.', // (proposed)
    needsLocation: "Needs location all the time to know when you're home.", // (proposed)
    notificationsOff: "Notifications are off, so reminders can't ring.", // (proposed)
    allow: 'Allow', // (proposed)
    save: 'Save', // (proposed)
    markDone: 'Mark done', // (proposed)
    delete: 'Delete', // (proposed)
    deleteTitle: 'Delete this reminder?', // (proposed)
    deleteBody: 'It goes from this phone and your server.', // (proposed)
    cancel: 'Cancel', // (proposed)
    errors: {
      title: 'Say what to remind you about.', // (proposed)
      past: 'Pick a time in the future.', // (proposed)
    },
    notFound: 'This reminder is gone.', // (proposed)
  },
} as const;
