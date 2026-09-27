# Reminders and location: status

Where the third part of the app stands after phases R1–R6 (27 Sep 2026). The plan is
`docs/aster-reminders-location-plan.md`; section numbers below point into it.

## What's built

| Part | Where | State |
|---|---|---|
| "Coming up" on 3.1 / 3.2 | `features/reminders/ComingUp.tsx` | Done. The unlocked profile's pending reminders; time first at home, arrive-home first away; three rows then "Show all"; Add; overdue times in warning. Hidden for Guest and Restricted. |
| Reminder editor *(proposed)* | `reminder/[id]` | Done. What; At a time (quick picks, Android's date and time dialogs, no past times) or When I get home; callouts with Allow for notifications and background location; Mark done and Delete when editing. |
| Reminder alarms | `features/reminders/alarms.ts` | Done. One scheduled notification per pending time reminder, plus snoozes, reconciled with Android's schedule after every change and at launch. Done and Snooze 30 min work with the app closed. |
| Arrive-home reminders | `features/reminders/actions.ts`, `tasks/geofence-task.ts` | Done. Ring on the geofence entry or a foreground arrival, once; a departure arms them again. One made at home waits for the phone to leave. |
| Reminder uploads | `features/reminders/queue.ts`, `sync.ts` | Done. Per profile, while it's unlocked; merge with `GET /reminders` on unlock and every 5 minutes in the foreground. |
| Location points | `features/location/tracking.ts`, `points.ts`, `tasks/location-task.ts` | Done. Foreground service with the ongoing notification; one point per interval; nothing while off or paused; arrived / left points on geofence events. |
| Device uploads | `features/location/uploads.ts` | Done. Points to `POST /locations/batch`, activity events (`arrived_home`, `left_home`, `reminder_fired`) to `POST /activity/batch`, with the device token, also from headless tasks. |
| 5.3 Location | `location` | Done. Day map and path, arrivals and departures, earlier days, Save my location, Keep history, Use my area, Pause / Resume. Owner only. |
| 5.1 Home and location | `(tabs)/settings` | Done. Home row and Location history (opens 5.3). Owner only. |
| Use my area in answers | `features/location/area.ts`, `chat/prompt.ts` | Done. The city, not coordinates, in the system message; never for Guest; the question carries the `area` context flag. |

Each phase has its own commit: R1 (plan, API calls, notifications, native config), R2 (reminders
store, queue, alarms, ringing, device queue), R3 (Coming up, editor), R4 (location points, uploads
and settings), R5 (5.3, 5.1 rows, Use my area), R6 (this check).

## Laravel contract check (27 Sep 2026)

With curl against `php artisan serve` and the local `aster` database (test household
`phase7-app@example.test`):

- `POST /reminders` answered 201, and 200 on a retry with the same `client_uuid`.
- `PATCH /reminders/{id}` accepted `trigger: arrive_home` with `due_at: null` and `status: done`.
- `DELETE /reminders/{id}` answered 204.
- `GET /location-settings` returned the five fields the app reads.
- `POST /locations/batch` (device token) returned `{ accepted, duplicates, discarded }`.
- `GET /locations?date=&tz=Asia/Kolkata` returned the point with numeric `lat`, `lng` and
  `accuracy_m`.
- `POST /activity/batch` returned `{ accepted, duplicates }`.

## Device check (27 Sep 2026)

x86_64 debug build (new native modules: expo-notifications, datetimepicker, the location
foreground service) on the Android 16 emulator; Laravel from `php artisan serve`; household
`phase7-app@example.test`, Owner "Phase Seven". zypherLL wasn't running (not needed here), so Home
showed "Home server not answering".

- **Time reminder.** 3.1 showed the empty "Coming up" card; Add opened the editor, where "Tonight
  9 PM" was hidden after 8 PM and the notifications callout's Allow brought up Android's prompt.
  Android's date and time dialogs set today 11:19 PM; Save put "Take the bins out · 11:19 PM" in
  "Coming up", Laravel got the row (pending, 17:49Z), and Android held an **exact** RTC_WAKEUP alarm
  (`exactAllowReason=allow-listed`).
- **Ringing.** At 23:19:00 the notification came on the `reminders` channel: "Take the bins out",
  subtext "Phase Seven", "You asked me to remind you at 11:19 PM.", with Done and Snooze 30 min.
- **Done from the shade** with the app in the background: the notification went, Laravel's row
  became `done`, and "Coming up" was empty after unlocking again.
- **Arrive-home reminder.** The editor's "Needs location all the time…" callout showed until
  "Allow all the time" was granted; the reminder made at home showed "When I get home". Leaving
  (Wi-Fi off, 6 km away) armed it; coming back rang "Water the plants — You asked me to remind you
  when you got home." at once, and Laravel got `reminder_fired` with `{trigger: arrive_home}` and
  no title.
- **Location.** With "Allow all the time", the foreground service started (type location) with
  "Aster · Saving your location every 15 minutes", and the first point reached Laravel with the
  phone's device token.
- **5.1 and 5.3.** The Owner's Settings showed Home and Location history ("Saved every 15 min ·
  kept 30 days"); 5.3 showed the map, "Today · Sun 27 Sep", "No arrivals or departures · 2 points
  saved" and yesterday. Use my area, Keep history (7 days), Pause (Paused until 12:42 AM) and
  Resume all saved to Laravel; the defaults were put back afterwards.
- Nothing sensitive in Metro's log or logcat (no token, PIN, password or reminder text).

### Found and fixed during the check

- **5.3 failed to load on the phone ("Couldn't load this day.").** Android reports India's zone as
  `Asia/Calcutta`, an old name Laravel's `timezone:all` rule refused (422). Laravel now accepts
  old names too (`timezone:all_with_bc`), with a test.
- **Done on the notification lost the `reminder_fired` event** when the app hadn't looked since the
  alarm rang. Done and Snooze now log the ring first.
- **Every geofence registration looked like an arrival or departure.** expo-location registers
  with an initial trigger, so each launch reported where the phone was, which would have saved an
  arrived / left point and activity event every time. Only a change from the last recorded event
  counts now.
- **Allowing "all the time" after launch didn't register the geofence** until the next start. The
  app now registers it when it comes back to the foreground.

Screenshots: `docs/screens/reminders-location/`.

## Decisions as built (plan §8)

1. Reminders are added from the app's editor; chat and voice come later.
2. Location runs as a foreground service with an ongoing notification; it resumes at the next
   launch after a reboot.
3. Queues are JS in AsyncStorage (`aster.reminders`, `aster.device-uploads`).
4. `SCHEDULE_EXACT_ALARM` is declared; on Android 14+ reminders may ring a few minutes late until
   the user allows "Alarms & reminders".
5. Reminders ring for every profile that made them on this phone, with the profile's name.
6. Snooze stays on the phone.
7. Activity events carry no reminder titles.
8. Arrive-home reminders ring once per arrival.
9. 5.3 came whole.
10. Use my area applies to every profile but Guest.

Also: a reminder deleted while its create is on the way is deleted on Laravel too; signing out
forgets the household's reminders, alarms, queued points and settings.

## Known gaps

- **Geofence events weren't seen on the emulator.** Google Play services refused the registration
  ("registration not permitted") even with Location Accuracy on; earlier device checks never saw
  one either (the dev facts' "Last geofence event" is empty). Arrive-home reminders were checked
  through home mode's foreground arrival instead; the geofence path (arrived / left points and
  `arrived_home` / `left_home`) is covered by tests. Try it on a phone.
- A periodic point every 15 minutes wasn't waited for; the first point after start was seen.
- Snooze 30 min was checked in tests, not on the device.
- While paused, the ongoing notification still says "Saving your location every 15 minutes"; the
  service keeps running because it couldn't restart from the background an hour later.
- Location updates and the geofence resume at the next app launch after a reboot (expo's task
  service does handle BOOT_COMPLETED, which may restore them sooner; not checked).
- Reminders still need their profile unlocked to reach Laravel; Done or Snooze from the
  notification is kept on the phone until then.
- The notification's large icon is the app's launcher icon, which has no foreground image yet.

## How to run against real servers

As in `docs/home-chat-status.md`. This part needs a new dev build (`npx expo prebuild`, then
`gradlew assembleDebug`), and on an emulator "Allow all the time" for location, which
`adb shell pm grant <package> android.permission.ACCESS_BACKGROUND_LOCATION` also gives.
