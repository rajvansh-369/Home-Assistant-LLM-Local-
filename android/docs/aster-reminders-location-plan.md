# Aster reminders and location in React Native: plan and phases

The third part of the app, after the first run (`docs/aster-first-run-plan.md`) and home mode with
chat (`docs/aster-home-chat-plan.md`, H1–H7). This is step 4 of the build order in
`../backend/aster-app-flow.md`: places, locations and reminders. The home place and its geofence
already exist (1.4, 1.5); this step adds what runs on top of them.

Sources, in order of authority:

- Design canvas (3.1 and 3.2 "Coming up", 4.4 Notifications, 5.1 Settings, 5.3 Location):
  https://claude.ai/artifact/9o4pyECfESN5n4YbcpZnj5
- Integration spec ("Location tracking", "Key flows: Arriving home", "Screens and the calls they
  make", "Errors and offline behaviour"): https://claude.ai/code/artifact/9f125718-f276-42cb-bd93-c8f45d7d2881
- Laravel contract: `../backend/docs/aster-backend-plan.md` §3 and §5 (built; routes in
  `../backend/routes/api.php`)

Canvas strings are copied exactly. Strings the canvas doesn't have are marked *(proposed)*.
Canvas sample people and data (Rohan, Mom, "Take Dad's medicines", Office, …) are never defaults.

## Contents

1. Scope
2. Architecture
3. Screens
4. Reminders
5. Location
6. Running in the background
7. Phases
8. Decisions to confirm
9. QA checklist

---

## 1. Scope

### In scope

- Reminders for the unlocked profile (not Guest, not Restricted): "Coming up" on 3.1 and 3.2, an
  add / edit screen *(proposed: the canvas has none)*, a local notification at the due time or on
  arriving home, with the canvas's Done and Snooze 30 min, and upload to Laravel through a queue.
- Location: a point every `interval_minutes` (15 by default) while "Save my location" is on,
  an `arrived` / `left` point on each home geofence event, queued on the phone and sent with the
  device token to `POST /locations/batch`.
- Activity events the phone owns: `arrived_home`, `left_home` and `reminder_fired`, sent to
  `POST /activity/batch`.
- 5.3 Location (Owner only): the day's map and arrivals / departures, Save my location, Keep
  history, Use my area in answers and Pause for 1 hour. The build order lists the history view in
  step 6, but the privacy switches need a home now, so 5.3 comes whole.
- 5.1 Settings, Owner only: the "Home and location" section with Home and Location history rows.
- "Use my area in answers": the city name added to chat prompts while `share_area` is on.

### Out of scope (later steps)

- Reminders made from chat or voice ("Remind me to…"). The model can't create them; the phone
  would have to parse the request. Later, with voice.
- 4.x Messages and VIP alerts, the "Welcome home" catch-up notification, the ongoing "listening"
  notification's VIP line, and the "Home server not answering" notification.
- 5.2 Memory and activity, 2.3 Profiles, 2.4 Edit profile, editing the home place from 5.1.
- Places other than Home (the canvas's "Office" row). Laravel keeps only the Home place.

---

## 2. Architecture

### Routes (expo-router)

```text
src/app/
  reminder/[id].tsx          add / edit a reminder: `new`, or a reminder's client_uuid (proposed)
  location.tsx               5.3 Location (Owner only)
```

### New code

| Path | Holds |
|---|---|
| `src/services/api` | `listReminders`, `createReminder`, `updateReminder`, `deleteReminder`, `getLocationSettings`, `putLocationSettings`, `getLocations` (profile token); `postLocations`, `postActivity` (device token). Real client and mock. |
| `src/services/notifications.ts` | expo-notifications setup: the `reminders` channel, the `reminder` category (Done, Snooze 30 min), permission check, schedule / cancel / present helpers. |
| `src/features/reminders/` | `store.ts` (every profile's reminders on this phone), `queue.ts` (uploads per profile), `sync.ts` (merge `GET /reminders`), `alarms.ts` (keep scheduled notifications in step with the store), `fire.ts` (arriving home, Done, Snooze), `format.ts`, `copy.ts`, `ComingUp.tsx`, `ReminderEditor.tsx` |
| `src/features/location/` | `settings.ts` (cached location settings and the actions that change them), `tracking.ts` (start / stop updates), `uploads.ts` (the device queue: points and activity events), `area.ts` (the city for "Use my area"), `copy.ts`, `LocationDay.tsx` |
| `src/tasks/location-task.ts` | `aster-location-updates`: periodic points |
| `src/tasks/notification-task.ts` | `aster-notification-actions`: Done and Snooze while the app is closed |
| `src/tasks/geofence-task.ts` | existing; also adds the `arrived` / `left` point, the activity event and fires arrive-home reminders |

### Stores and keys

| Key | Holds |
|---|---|
| `aster.reminders` | every profile's reminders on this phone, and their upload jobs |
| `aster.location-settings` | the last `GET /location-settings` (defaults until the Owner first unlocks) |
| `aster.device-uploads` | location points and activity events not yet accepted by Laravel |
| `aster.area` | the city for "Use my area", with when it was worked out |

Tasks run in a headless JS runtime when the app is closed, where no screen has loaded a store.
So every store here loads itself from AsyncStorage on first use (`ensureLoaded()`) and all writes,
from screens and from tasks, go through the same store functions. Writes to one key are chained,
so a task and a screen in the same runtime never overwrite each other.

---

## 3. Screens

### 3.1 / 3.2 "Coming up"

- Section label "Coming up" (mono caps) with "Add" on the right *(proposed)*. Card of rows: icon
  (`AlarmClock` for time, `MapPin` for home), title 15/600, trailing label mono 12:
  "9:00 PM" (today), "Tomorrow 10:00", "Fri 10:00", "26 Sep 10:00", or "When I get home" in
  accent. A time already past shows its label in warning *(proposed)*.
- The unlocked profile's pending reminders only. At home: time reminders first, by due time, then
  arrive-home. Away: arrive-home first, as on 3.2.
- Three rows, then "Show all ({n})" *(proposed)* expands the card. A row opens the editor.
- None pending: one row "Nothing coming up" with "Add a reminder" *(proposed)*.
- Hidden for Guest and Restricted.
- On 3.1 the card sits between the banner and the suggestions; on 3.2 under the away card.

### Reminder editor *(proposed; canvas style)*

- `ScreenHeader`: "New reminder" or "Reminder".
- `TextField` "What" (placeholder "Call the plumber", max 200).
- `Segmented`: "At a time" | "When I get home".
- At a time: quick chips "In 1 hour", "Tonight 9 PM" (hidden after 8 PM), "Tomorrow 9 AM"; then
  two pills for the day and the time, opening Android's date and time dialogs
  (`@react-native-community/datetimepicker`). The time must be in the future.
- When I get home: helper "Rings when you arrive home." When background location isn't allowed:
  callout "Needs location all the time to know when you're home." with Allow.
- Notifications not allowed: callout "Notifications are off, so reminders can't ring." with Allow.
- Buttons: Save. Editing also shows "Mark done" and "Delete" (text link, confirm dialog).

### 5.3 Location (Owner only)

Canvas layout: header "Location" with back; 280-tall map; day row; timeline card; "Settings"
label; settings card; "Pause for 1 hour"; lock line.

- Map: the home area (accent circle, dashed) and pin, the day's path as a dotted warning line
  with small dots, and the last point as the sky pin. Blank map without a Maps key.
- Day row: previous / next, "Today · Wed 23 Sep", "Yesterday · Tue 22 Sep", "Mon 21 Sep". Next is
  off on today; previous stops at the retention limit.
- Timeline: the day's `left` and `arrived` points: "Left home" / "Assistant paused", "Arrived
  home" / "Assistant turned on", with the time. None: "No arrivals or departures" and "{n} points
  saved" *(proposed)*. Load failure: "Couldn't load this day." with Try again *(proposed)*.
- Settings card: "Save my location" / "Every {n} minutes, and when you arrive or leave" (switch);
  "Keep history" / "{n} days" (opens a choice of 7, 14, 30, 60, 90 days *(proposed)*); "Use my area
  in answers" / "City only, like “Pune”" (switch).
- "Pause for 1 hour"; while paused, "Paused until 3:40 PM · Resume" *(proposed)*.
- Lock line: "Only the Owner can see this. Points older than {n} days are deleted."
- Points waiting to upload: "{n} points waiting to upload" under the lock line *(proposed)*.

### 5.1 Settings: Home and location (Owner only)

- Section label "Home and location".
- "Home" / "{address} · {radius} m" (information only for now).
- "Location history" / "Saved every {n} min · kept {d} days", or "Off", or "Paused until {time}";
  opens 5.3.

---

## 4. Reminders

### Store

One record per reminder: `clientUuid`, `serverId`, `profileId`, `profileName`, `title`,
`trigger` (`time` | `arrive_home`), `dueAt`, `status` (`pending` | `done` | `cancelled`),
`firedAt`, `snoozedUntil`, `updatedAt`. Jobs: `create`, `update` (the changed fields), `delete`,
per reminder, in order.

### Laravel

- `GET /reminders` after a profile unlocks, when 3.1 opens, and every 5 minutes in the
  foreground while unlocked. Merge: a reminder with jobs still queued keeps the phone's copy;
  otherwise the server's copy wins; an uploaded reminder missing from the list was deleted
  elsewhere and goes. Reminders not uploaded yet stay.
- The queue works like the chat queue: jobs run only while their profile is unlocked (they need its
  token), in order per reminder, with the same back-off (5 s, 30 s, 2 min, then 5 min). 422, 403
  and 404 drop the job; 401 stops the run.

### Ringing

- Time: one scheduled notification per pending reminder, identifier = `client_uuid`, on the
  `reminders` channel. The store and the scheduled list are compared at every launch and after
  every change, so edits, deletes and merges move or cancel alarms.
- Arriving home: the geofence "enter" task presents a notification for every pending arrive-home
  reminder not rung since the last "exit". Also when home mode turns at-home in the foreground, in
  case the geofence was late. `firedAt` stops repeats.
- Notification: title = the reminder; body "You asked me to remind you when you got home." or
  "You asked me to remind you at 9:00 PM." *(proposed)*; subtext = the profile's name. Actions
  "Done" and "Snooze 30 min" (canvas), neither opening the app. A tap opens the editor.
- Done: status `done`, the notification dismissed, an `update` job queued. Snooze: a one-off
  notification in 30 minutes (`{uuid}:snooze`); the reminder stays pending on Laravel.
- Each ring queues a `reminder_fired` activity event with `{ trigger }` in meta, never the title.

---

## 5. Location

### Collecting

- `Location.startLocationUpdatesAsync("aster-location-updates", …)` with balanced accuracy,
  `timeInterval` and `deferredUpdatesInterval` = `interval_minutes`, no distance filter, and a
  foreground service notification: "Aster" / "Saving your location every {n} minutes"
  *(proposed)*. The spec asks for an ongoing notification whenever location is on.
- Started from the foreground (Android refuses to start a location service from the background):
  at launch, after 1.5 grants "Allow all the time", and when "Save my location" is turned on.
  Runs only with the first run done, background location granted and "Save my location" on.
  Stopped when it's turned off, and on sign-out or reset.
- The task keeps a point only if it's at least `interval_minutes − 1` after the last kept one,
  and drops everything while paused. Each point gets a `client_uuid`.
- Geofence enter / exit adds an `arrived` / `left` point: the last known fix if it's under 5
  minutes old and inside 200 m accuracy, else the home centre with `accuracy_m` = radius.
  `place_id` = the home place's id when known.

### Uploading (device token)

- `aster.device-uploads` holds points (at most 5,000) and events (at most 1,000); the oldest go
  first when full.
- Flush: up to 500 points to `POST /locations/batch`, then up to 500 events to
  `POST /activity/batch`, repeated while more are waiting. After each new point, on launch, when
  the app comes to the foreground and when NetInfo reconnects. Accepted, duplicate and discarded
  points all leave the queue.
- A failure keeps the batch for the next flush (next point or foreground). A 422 drops that batch
  and records why in the dev facts; a 401 stops (the device was signed out).
- The device token is in SecureStore, which a headless task can read. The server address is read
  from the first-run store's saved state.

### Settings

- `GET /location-settings` when the Owner unlocks and when 5.3 opens; cached for everyone, since
  tracking runs whoever is unlocked. Defaults before the first read: on, 15 minutes, 30 days,
  area off, not paused.
- Changes from 5.3 use `PUT /location-settings` with the Owner's token, shown at once, reverted
  with "Couldn't save. Try again." *(proposed)* if Laravel refuses.
- Pause: `paused_until` = now + 1 hour. The phone drops points until then; Laravel would discard
  them anyway.

### Use my area in answers

While `share_area` is on and "Save my location" is on, the city of the latest fix (reverse
geocoded on the phone, at most every 30 minutes, in the foreground) is added to chat prompts as a
system line "The user is in or near {city}." and the message's `context` gets `area`. Never for
Guest. No coordinates leave the phone for this.

---

## 6. Running in the background

| Event | Runs | Does |
|---|---|---|
| Location update | `aster-location-updates`, headless when closed | keep point, flush |
| Geofence enter / exit | `aster-home-geofence` | record event (home mode), point, activity event, arrive-home reminders (enter), flush |
| Done / Snooze tapped | `aster-notification-actions` (expo-notifications runs it for action buttons while the app is backgrounded or closed) | Done or Snooze |
| Reboot | expo-notifications re-schedules alarms itself | location updates and geofence start again at the next launch |

All three tasks are defined at module scope and imported from the root layout.

---

## 7. Phases

| Phase | Builds | Result |
|---|---|---|
| R1 | API calls (real and mock), notifications service, native config (expo-notifications, datetimepicker, location foreground service, exact alarms) | Unit-tested calls; the app builds |
| R2 | Reminders store, queue, sync, alarms, arriving-home firing, notification actions | Unit-tested rules for merge, queue and ringing |
| R3 | "Coming up" on 3.1 / 3.2, the reminder editor | Reminders added, edited and done from the app |
| R4 | Location settings cache, tracking task, device uploads, geofence points and activity events | Unit-tested collecting and uploading |
| R5 | 5.3 Location, 5.1 Home and location rows, Use my area | The Owner sees the day and changes the settings |
| R6 | Device QA against Laravel, status doc | §9 ticked or explained |

Each phase ends with typecheck, lint and Jest passing, and a commit.

---

## 8. Decisions to confirm

1. **Reminders are added from the app**, with a small editor the canvas doesn't have. Asking
   Aster ("Remind me…") comes with voice.
2. **Location uses a foreground service** (an ongoing notification while it's on), not a
   WorkManager job: expo-location has no WorkManager path, and the spec wants the notification
   anyway. It starts only from the foreground, so after a reboot it resumes at the next launch.
3. **Queues are JS in AsyncStorage**, as with chats, not Room and WorkManager.
4. **Exact alarms**: the app declares `SCHEDULE_EXACT_ALARM`. Android 12–13 grant it; on 14 and
   later, until the user allows "Alarms & reminders", reminders may ring a few minutes late.
5. **Reminders ring on this phone for every profile** that made them here, with the profile's
   name on the notification, since alarms can't wait for an unlock. "Coming up" shows only the
   unlocked profile's.
6. **Snooze stays on the phone**; Laravel only hears Done.
7. **Activity events carry no reminder titles**, only the trigger.
8. **Arrive-home reminders ring once** per arrival, until Done.
9. **5.3 comes now**, map and all, because its switches are the privacy controls.
10. **Use my area applies to every profile but Guest**, since the phone's location is where the
    speaker is.

---

## 9. QA checklist

- [ ] Add a time reminder: it shows in "Coming up", reaches Laravel, and rings at the time with
      Done and Snooze 30 min.
- [ ] Done from the notification with the app closed: status `done` on Laravel after the next
      unlock.
- [ ] Snooze rings again 30 minutes later.
- [ ] An arrive-home reminder rings on entering the home area, once.
- [ ] Edit and delete move or cancel the alarm; a reminder deleted on Laravel leaves the phone.
- [ ] Guest and Restricted see no reminders.
- [ ] With "Save my location" on, the ongoing notification shows and a point reaches Laravel every
      interval; arrivals and departures add `arrived` / `left` points and activity events.
- [ ] With Laravel down, points wait and go later; pausing stops points for an hour.
- [ ] 5.3 shows today's path and events, earlier days, and saves each setting; non-Owners can't
      open it.
- [ ] Use my area adds the city to prompts, never coordinates.
- [ ] No token, PIN or reminder text in the logs; activity events carry no titles.
- [ ] Typecheck, lint and Jest pass; the flows work on the emulator against Laravel.
