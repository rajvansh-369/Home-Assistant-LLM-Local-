// Location: the ongoing notification, 5.3 Location, the 5.1 rows and the activity events
// (docs/aster-reminders-location-plan.md §3, §5). Canvas strings are exact; the rest are marked.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const clock = (date: Date) => {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
};

export const location = {
  /** The foreground service's ongoing notification. (proposed) */
  service: {
    title: 'Aster',
    body: (minutes: number) => `Saving your location every ${minutes} minutes`,
  },

  /** What Laravel's activity log shows. (proposed) */
  activity: {
    arrived: 'Arrived home',
    left: 'Left home',
  },

  screen: {
    title: 'Location',
    back: 'Back',
    previousDay: 'Previous day',
    nextDay: 'Next day',
    /** "Today · Wed 23 Sep" (canvas), "Yesterday · Tue 22 Sep", "Mon 21 Sep". */
    day: (date: Date, daysAgo: number) => {
      const label = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
      if (daysAgo === 0) return `Today · ${label}`;
      if (daysAgo === 1) return `Yesterday · ${label}`; // (proposed)
      return label;
    },
    mapLabel: 'Map of the day: home and the path', // (proposed)
    left: 'Left home',
    leftDetail: 'Assistant paused',
    arrived: 'Arrived home',
    arrivedDetail: 'Assistant turned on',
    time: clock,
    noEvents: 'No arrivals or departures', // (proposed)
    points: (count: number) => `${count} ${count === 1 ? 'point' : 'points'} saved`, // (proposed)
    loadFailed: "Couldn't load this day.", // (proposed)
    tryAgain: 'Try again', // (proposed)
    settings: 'Settings',
    save: 'Save my location',
    saveDetail: (minutes: number) => `Every ${minutes} minutes, and when you arrive or leave`,
    keep: 'Keep history',
    keepDays: (days: number) => `${days} days`,
    keepChoices: [7, 14, 30, 60, 90], // (proposed)
    keepTitle: 'Keep history for', // (proposed)
    area: 'Use my area in answers',
    areaDetail: 'City only, like “Pune”',
    pause: 'Pause for 1 hour',
    pausedUntil: (until: Date) => `Paused until ${clock(until)}`, // (proposed)
    resume: 'Resume', // (proposed)
    ownerOnly: (days: number) =>
      `Only the Owner can see this. Points older than ${days} days are deleted.`,
    waiting: (count: number) => `${count} ${count === 1 ? 'point' : 'points'} waiting to upload`, // (proposed)
    saveFailed: "Couldn't save. Try again.", // (proposed)
    cancel: 'Cancel', // (proposed)
  },

  /** 5.1 Settings, Owner only. */
  settingsRows: {
    section: 'Home and location',
    home: 'Home',
    homeDetail: (address: string, radius: number) => `${address} · ${radius} m`,
    history: 'Location history',
    historyDetail: (minutes: number, days: number) =>
      `Saved every ${minutes} min · kept ${days} days`,
    off: 'Off', // (proposed)
    paused: (until: Date) => `Paused until ${clock(until)}`, // (proposed)
  },

  /** The system line "Use my area in answers" adds to chat prompts. (proposed) */
  areaPrompt: (city: string) => `The user is in or near ${city}.`,
} as const;
