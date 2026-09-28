# Aster messages and spoken alerts in React Native: plan and phases

The fourth part of the app, after the first run (`docs/aster-first-run-plan.md`), home mode with
chat (`docs/aster-home-chat-plan.md`, H1–H7) and reminders and location
(`docs/aster-reminders-location-plan.md`, R1–R6). This is step 5 of the build order in
`../backend/aster-app-flow.md` ("notification listener and spoken alerts") and of the integration
spec's build order ("notification listener, VIP spoken alerts, catch-up and reply drafts").

Sources, in order of authority:

- Design canvas (3.1 "Missed while you were away", 3.2 VIP card, 4.1 Messages, 4.2 Thread,
  4.3 Spoken alerts, 4.4 Notifications, 5.1 Settings, the Flow's path 4 "Missed-message alerts"):
  https://claude.ai/artifact/9o4pyECfESN5n4YbcpZnj5
- Integration spec ("Home mode" feature table, "What lives where", "Calling zypherLL from the app",
  "Screens and their APIs", "Errors and offline behaviour"):
  https://claude.ai/code/artifact/9f125718-f276-42cb-bd93-c8f45d7d2881
- Laravel contract: `../backend/docs/aster-backend-plan.md` §3 (`vip_contacts`, `alert_settings`,
  `activity_logs`) and §5 (`/alert-settings`, `/vip-contacts`, `/activity/batch`; built, routes in
  `../backend/routes/api.php`)

Canvas strings are copied exactly. Strings the canvas doesn't have are marked *(proposed)*.
Canvas sample people and data (Rohan, Mom, Arjun, Neha, "Beta, call me…", …) are never defaults.

## Contents

1. Scope
2. Architecture
3. Screens
4. Capturing messages
5. Spoken alerts
6. AI help: catch-up and reply drafts
7. Running in the background
8. Phases
9. Decisions to confirm
10. QA checklist

---

## 1. Scope

### In scope

- Capture of WhatsApp (and WhatsApp Business), Google Chat and SMS messages from their
  notifications, with the notification listener that 1.5 already turns on. Kept on the phone only,
  encrypted, for 7 days *(proposed)*.
- 4.1 Messages (a tab, Owner only): catch-up card, VIP and everyone-else threads, unread counts.
- 4.2 Thread: the captured messages, the suggested reply card (at home), rewrite, and Send through
  the source app's notification Reply action.
- VIP spoken alerts with the app closed: a VIP's message not opened within
  `missed_after_minutes` is spoken in the phone's voice, subject to quiet hours, urgent words,
  headphones only and only at home; otherwise it waits as a notification (4.4).
- 4.3 Spoken alerts (Owner only), with a small VIP contact editor *(proposed: the canvas has only
  "Add a VIP contact")*, saved to Laravel's `/alert-settings` and `/vip-contacts`.
- 4.4 Notifications: the VIP missed-message notification, "Welcome home" with the catch-up offer,
  and "Home server not answering".
- 3.1 "Missed while you were away" and the "Listening · 3 VIPs" chip; 3.2 "3 messages from VIPs".
- 5.1 Settings, Owner only: "Alerts and background" (Spoken alerts, Run in background) and the
  Privacy row "Hide message text on lock screen".
- Activity events the phone owns: `spoken_alert`, `reply_sent`, `server_problem`.

### Out of scope (later steps)

- 3.6 Voice, the "Hey Aster" wake word and voice replies. The notification's "Reply by voice"
  becomes "Reply" and opens 4.2 until voice exists.
- The ongoing "At home · listening for 3 VIPs" notification: the listener needs no foreground
  service, and the location service already has its own ongoing notification.
- Adding captured messages to ordinary chats ("What did Mom say?"). "Ask about it" on 4.1 opens a
  private chat instead, which is never uploaded (backend plan decision 10).
- Search on 4.1 (the canvas's search button), older chat history, attachments and images.
- 5.2 Memory and activity, 2.3 Profiles, 2.4 Edit profile.

---

## 2. Architecture

Everything that must work with the app closed runs in Kotlin in `modules/aster-system`, inside the
notification listener's process: capture, the encrypted store, the "missed" timers, the rules,
speaking and the missed-message notification. JS owns the screens, Laravel, zypherLL and the
settings, and hands the native side a copy of the rules. No JS runs per notification.

```text
WhatsApp / Google Chat / SMS notification
  -> AsterNotificationListener (Kotlin)  parse -> MessageStore (SQLite, AES-GCM, Keystore key)
                                         VIP? -> AlertEngine: timer (AlarmManager) at +N min
  -> timer: still unread? rules OK? -> TextToSpeech + missed notification, activity event queued
  -> JS (when running): 4.1 / 4.2 read the store; drain activity events to /activity/batch
```

### Routes (expo-router)

```text
src/app/
  (tabs)/messages.tsx        4.1 Messages (tab; hidden for everyone but the Owner)
  thread/[key].tsx           4.2 Thread (a captured thread's key)
  alerts.tsx                 4.3 Spoken alerts (Owner only)
  vip/[id].tsx               VIP contact editor: `new` or a VIP contact's id (proposed)
```

`aster://thread/{key}` opens 4.2 (the missed-message notification's tap and Reply).

### Native (`modules/aster-system/android`)

| File | Holds |
|---|---|
| `AsterNotificationListener.kt` | posted / removed notifications of the supported apps; reply actions per thread (in memory) |
| `MessageParser.kt` | notification extras to messages: source, thread title, group, sender, text, time; own messages skipped |
| `MessageStore.kt` | SQLite `aster-messages.db`: messages (sender, title and text encrypted), pending alerts; 7-day purge |
| `Crypto.kt` | AES-256-GCM with a key in the Android Keystore (`aster-messages`) |
| `AlertRules.kt` | pure rules: VIP match, quiet hours, urgent words, what to say |
| `AlertEngine.kt` | config, timers, speaking, holding, the missed notification, queued activity events |
| `AlertReceiver.kt` | AlarmManager and notification-button broadcasts (missed check, Remind in 30 min) |
| `Speaker.kt` | TextToSpeech with transient audio focus (ducking others) |
| `AsterSystemModule.kt` | the JS API below, and `onMessagesChanged` / `onActivity` events |

JS API added to `modules/aster-system/index.ts`: `listThreads()`, `threadMessages(key)`,
`markThreadSeen(key)`, `sendReply(key, text)`, `openSourceApp(key)`, `setAlertConfig(json)`,
`setAtHome(bool)`, `setLlmAccess(access | null)`, `speak(text)`, `stopSpeaking()`,
`takeActivity()`, `clearMessages()`.

### JS

| Path | Holds |
|---|---|
| `src/services/api` | `getAlertSettings`, `putAlertSettings`, `listVipContacts`, `createVipContact`, `updateVipContact`, `deleteVipContact` (Owner token). Real client and mock. |
| `src/features/messages/` | `threads.ts` (the native store as a zustand store, refreshed on `onMessagesChanged`), `vip.ts` (match rules shared with Kotlin), `alerts.ts` (cached alert settings and VIP contacts, the actions that change them, the config handed to native), `catchup.ts` and `drafts.ts` (zypherLL prompts), `notify.ts` (Welcome home, Home server not answering), `install.ts`, `copy.ts`, `format.ts`, screens and cards |

### Stores and keys

| Key | Holds |
|---|---|
| `aster-messages.db` (native) | captured messages and pending alert timers |
| `aster.alerts` (native SharedPreferences) | the rules JS last handed over, at home or not, "hide text on lock screen", queued activity events |
| `aster.alert-settings` (AsyncStorage) | the last `GET /alert-settings` and `GET /vip-contacts`, and the lock-screen choice |

---

## 3. Screens

### 4.1 Messages (tab, Owner only)

- Tab "Messages" between Chats and Settings, with the canvas's warning badge: unread VIP messages.
  Hidden for Member and Restricted (Guest never sees tabs).
- Title "Messages". The canvas's search button is left out (§1).
- Filter chips: "All", "WhatsApp", "SMS", "Google Chat", each with its unread count when above 0
  *(proposed: the canvas's numbers aren't defined)*.
- Catch-up card: orb, "Catch-up", "{n} unread · {m} chats" (mono), the summary, then "Read aloud"
  and "Ask about it". At home with the model ready the summary is written once per set of unread
  messages (§6). Otherwise: "Summaries need your home server." *(proposed)*, and Read aloud reads
  the unread messages instead. Nothing unread: "You're all caught up." *(proposed)*, no buttons.
- "VIP" (star, warning) and "Everyone else" sections; card rows: avatar (initial on a profile
  colour picked from the name; a message tile for senders without a name), name, source badge
  ("WhatsApp", "Google Chat", "SMS"), time ("7:42 PM" today, "Yesterday", "Mon", "23 Sep"), last
  message, "Read aloud at 8:02 PM" when Aster spoke it, unread badge (warning for VIPs, neutral
  *(proposed)* for others). One-time codes show "One-time code hidden · tap to show".
- Footnote: "Aster sees messages from the moment notification access is on. Older chat history
  isn’t available."
- Notification access off: callout "Notification access is off, so Aster can’t see new
  messages." with Allow *(proposed)*. Nothing captured yet: "No messages yet. New WhatsApp,
  Google Chat and SMS messages show up here." *(proposed)*.

### 4.2 Thread

- Header: back, avatar, name, "WhatsApp · VIP" (or just the source), and the star button
  ("VIP contact", pressed when the sender is a VIP), which adds or turns off the VIP contact.
- "Today" divider, received bubbles with times; in groups the sender's name above each. Replies
  sent from 4.2 show as the user's bubbles.
- "Aster read these aloud at 8:02 PM" after the last spoken message.
- Suggested reply card (at home, model ready): orb, "Aster", "suggested reply"; the one-line
  summary; three reply chips; "Your reply" and the text box (the draft); "Rewrite" with
  "Shorter", "Warmer", "Hinglish"; "Send via WhatsApp"; after sending "Sent through WhatsApp at
  8:06 PM"; footnote "Sends through the WhatsApp notification’s Reply action. Nothing goes out
  until you tap Send."
- While drafting: "Drafting a reply…" *(proposed)*. Failure: "Couldn’t draft a reply." with Try
  again *(proposed)*. Away or the model not ready: no chips or Rewrite, "Suggestions need your home
  server." *(proposed)*; "Your reply" and Send still work.
- No Reply action left (the source notification is gone): Send disabled, "The WhatsApp
  notification is gone, so Aster can’t reply from here." and "Open WhatsApp" *(proposed)*.
- Opening the thread marks it read and removes Aster's missed notification for it.

### 4.3 Spoken alerts (Owner only)

Canvas layout, top to bottom; every change is shown at once and saved to Laravel, and put back
with "Couldn’t save. Try again." *(proposed)* when Laravel refuses.

- "Speak missed messages" / "Only from your VIP contacts" (switch: `enabled`).
- "VIP contacts": rows with avatar, name, sources ("WhatsApp · SMS"), and a switch (`enabled`); a
  row opens the editor. "Add a VIP contact".
- "Count it as missed after": 2 / 5 / 10 / 15 min; "If you open the chat before then, Aster stays
  quiet." A saved value outside these shows as its own option.
- "What Aster says": "Full message", "Summary", "Name only", the sample line for the choice (with
  the first VIP's name, else "Someone" *(proposed)*), and for Summary: "Summary needs your home
  server. Away from home, or while the model is busy, Aster reads the full message."
- "Quiet hours": "Quiet hours" / "11:00 PM to 7:00 AM" (switch; on sets 11:00 PM–7:00 AM
  *(proposed default)*, the two times open Android's time dialog); "Still speak urgent ones" /
  "When a VIP writes “urgent” or “call me”" (on = `urgent_keywords: ["urgent", "call me"]`, off =
  `[]`); "Headphones or car only" / "Never read messages on the speaker"; "Only speak at home" /
  "Away from home, missed messages wait as notifications".
- Notification access off: the 4.1 callout at the top.

### VIP contact editor *(proposed; canvas style)*

- Title "New VIP contact" or "VIP contact". "Name" (max 60). "Name in notifications" (max 120),
  helper "Exactly as it shows in the app’s notifications, like the contact’s saved name." "Apps":
  WhatsApp, Google Chat, SMS chips (at least one).
- "From your messages": up to 6 recent senders; a tap fills Name, Name in notifications and the app.
- Save; editing adds "Delete" (confirm dialog).

### 3.1 / 3.2 (Owner only)

- 3.1 chip "Listening · 3 VIPs" (pulsing dot) before the home status chip, while notification
  access is on and alerts are on; opens 4.3.
- 3.1 card "Missed while you were away" (warning border), when VIPs have unread messages: up to two
  thread rows with quoted last message and count, then "Read aloud" and "Summarize" (opens 4.1).
- 3.2 card: overlapping avatars, "3 messages from VIPs", "Aster will offer a catch-up when you get
  home", chevron to 4.1. 3.2's body becomes "Chat switches on when you get home. Reminders, message
  capture and location keep working." (canvas, without voice).

### 4.4 Notifications

| Notification | Title / body | Buttons |
|---|---|---|
| VIP missed (native, channel `alerts` "Missed messages" *(proposed)*) | "Mom · 2 missed WhatsApp messages" / "“Are you coming Sunday…”" | "Reply" *(proposed, see §1)*, "Remind in 30 min", "Open" |
| Welcome home (JS, channel `home` "Arriving home" *(proposed)*) | "Welcome home" / "zephyr-7b is ready. You missed 3 messages from Mom and Arjun." | "Catch me up", "Later" |
| Server problem (JS, channel `home`) | "Home server not answering" / "You’re home, but 192.168.1.20 isn’t replying. Alerts still read messages out." | "Retry", "Settings" |

"Hide message text on lock screen" (on by default, as drawn) makes the missed notification private:
the lock screen shows only "Mom · 2 missed WhatsApp messages".

### 5.1 Settings (Owner only)

- "Alerts and background": "Spoken alerts" / "3 VIP contacts · missed after 5 min" (or "Off"),
  opens 4.3; "Run in background" / "Battery usage: Unrestricted" (or "Battery usage: Optimized"
  *(proposed)*, a tap asks Android).
- "Privacy": "Hide message text on lock screen" (switch, phone only).

---

## 4. Capturing messages

- Packages: `com.whatsapp`, `com.whatsapp.w4b` (WhatsApp), `com.google.android.apps.dynamite`
  (Google Chat), and SMS from the default SMS app plus `com.google.android.apps.messaging`,
  `com.samsung.android.messaging`, `com.android.messaging`.
- Skipped: group summaries, ongoing and foreground-service notifications, Aster's own, and
  messages with no sender (the user's own replies in MessagingStyle).
- Parsing: `EXTRA_MESSAGES` (MessagingStyle; per message `text`, `time`, `sender` or
  `sender_person`) when present, else `EXTRA_TITLE` / `EXTRA_BIG_TEXT` or `EXTRA_TEXT` with the
  notification's `when`. Thread title: `EXTRA_CONVERSATION_TITLE`, else the sender of a one-to-one
  chat, with a trailing "(2 messages)" removed. Group: `EXTRA_IS_GROUP_CONVERSATION`.
- Thread key: `{source}:{first 20 hex of SHA-256(normalised title)}`, so the key holds no name.
- Dedup: apps re-post the whole conversation with each message, so each message has a digest of
  thread, sender, time and text; a known digest is skipped.
- One-time codes: a message with a code word ("OTP", "code", "verification", "one-time",
  "passcode", "PIN") and 4–8 digits is flagged; it is never spoken, never sent to zypherLL, and
  4.1 / 4.2 hide it until tapped.
- Read: a message is read when its notification leaves the tray for any reason but the listener
  itself (the user opened or dismissed it, or the app cleared it after it was read elsewhere), or
  when the Owner opens the thread in 4.2.
- Reply: the newest posted notification of the thread with a `RemoteInput` action is kept in memory
  (and looked up again in the tray when needed). Send fills the RemoteInput and fires the action;
  the reply is stored as the user's message. Nothing goes out without the Send tap.
- Stored: SQLite, with sender, title and text in one AES-256-GCM blob per message; the key never
  leaves the Keystore. At most 7 days and 2,000 messages *(proposed)*. Signing out or resetting
  clears the store.

---

## 5. Spoken alerts

### The rules on the phone

JS hands native a JSON copy after every change and at launch: the alert settings, enabled VIP
contacts (`name`, `match_key`, `sources`), "hide text on lock screen", and the Owner's name. Native
keeps it, so alerts work after a reboot without JS. Defaults before the first read: Laravel's.

- VIP match: the message's sender (or a one-to-one thread's title) equals a VIP's `match_key`
  after normalising (Unicode NFKC, lower case, spaces collapsed, trimmed), and the message's source
  is in the VIP's `sources`.
- A VIP's unread message starts the thread's timer at its time + `missed_after_minutes`
  (AlarmManager, exact when allowed). Later messages don't restart it. Kept in the store, so a
  restart re-arms it. A message already 30 minutes old when captured (after a restart, say) is
  kept but never alerted *(proposed)*. On a call, Aster holds.
- At the timer: nothing if alerts are off or the thread was read. Else the unread, unspoken VIP
  messages of the thread (newest 5) are "missed":
  - Speak when: outside quiet hours (or a message holds an urgent word, when those are on), at home
    or "Only speak at home" off, and a headset, Bluetooth audio or car is connected or "Headphones
    or car only" off.
  - Otherwise hold: the missed notification is posted silently and nothing is spoken later. On
    arriving home, "Welcome home" offers the catch-up (§3 4.4).
- What Aster says (canvas):
  - Full: "Mom sent 2 WhatsApp messages. Beta, call me when you’re free. Are you coming Sunday for
    lunch?" (each text up to 300 characters, sentence-ended).
  - Name: "You missed 2 WhatsApp messages from Mom."
  - Summary: "Mom sent 2 WhatsApp messages." then a one-line summary from zypherLL; only at home
    with the Owner's llm_token in memory (§7), 20 s at most, else Full.
- Speaking: TextToSpeech in the phone's default voice, with transient audio focus that ducks other
  audio. The missed notification is posted at the same time; its "Remind in 30 min" runs the same
  check again in 30 minutes.
- Each spoken alert queues `spoken_alert` with summary "Read out 2 WhatsApp messages from Mom"
  *(proposed)* and meta `{ source, count, mode }`, no message text and no profile.

### Other events

- `reply_sent`: "Replied to Mom on WhatsApp" *(proposed)*, meta `{ source }`, the Owner's profile.
- `server_problem`: "Home server not answering", meta `{}`, once per arrival.

Native queues its events in SharedPreferences; JS moves them into the device queue
(`features/location/uploads.ts`) at launch, on coming to the foreground and on `onActivity`.

### Laravel

- `GET /alert-settings` and `GET /vip-contacts` when the Owner unlocks and when 4.3 opens; cached
  for everyone (alerts run whoever is unlocked).
- 4.3 and the editor use `PUT /alert-settings`, `POST`, `PATCH` and `DELETE /vip-contacts` with the
  Owner's token, shown at once and put back on failure.

---

## 6. AI help: catch-up and reply drafts

All three prompts go to the **local** engine (never Mark-L, so captured messages don't leave the
house), with `web: false`, `memory: false`, `sampling: "precise"`, through `askZypher` (so the 401
and out-of-memory retries apply). They need home mode Ready. One-time codes are left out.

- Catch-up (4.1, 3.1 "Summarize"): the unread messages (newest 40, grouped by chat, sender and
  time), asking for two or three plain sentences on who is waiting and what about, like the
  canvas's "Mom and Arjun are waiting on you. The rest are an invoice from Neha, a bank OTP and
  family photos." Cached per set of unread messages until they change.
- Reply draft (4.2): the thread's last 12 messages and the Owner's name, asking for JSON
  `{ "summary", "draft", "replies": [{ "label", "text" } ×3] }`. The first `{…}` in the answer is
  parsed; anything unusable is a failure.
- Rewrite: the current draft plus "Make it shorter" / "Make it warmer" / "Rewrite it in Hinglish
  (Hindi in Latin letters mixed with English)"; the answer replaces the draft.
- "Ask about it" opens a private chat (never uploaded, memory off) whose system message holds the
  unread messages; its questions go with `web: false`.
- "Read aloud" speaks the catch-up summary, or the unread messages in Full wording.

---

## 7. Running in the background

| Event | Runs | Does |
|---|---|---|
| A supported notification is posted | the listener (Kotlin) | store, VIP timer |
| A notification is removed | the listener | mark read, cancel the timer |
| Timer, Remind in 30 min | `AlertReceiver` | rules, speak or hold, missed notification |
| Reply / Open / tap on the missed notification | the app (deep link) or the source app | 4.2, or the source app's own intent |
| Geofence enter | `aster-home-geofence` (JS, headless) | tells native "at home"; checks `/health` (3 s) and posts Welcome home once per arrival when VIP messages are unread |
| Home mode changes in the foreground | JS | tells native; Welcome home / Home server not answering once per arrival |
| Owner unlocks / locks | JS | `setLlmAccess` with the llm_token and LLM address, or null |

The Owner's llm_token is handed to native in memory only (never written), and dropped when the
session locks or expires, as the app already does with its own copy.

---

## 8. Phases

| Phase | Builds | Result |
|---|---|---|
| M1 | Plan; API calls (real and mock); native capture, parser, encrypted store, reply, and the alert engine (rules, timers, speaking, missed notification, activity queue); JS bindings and the threads store | Unit-tested calls, threads and rules (Jest and JUnit); the module compiles |
| M2 | JS alert settings cache and actions, the config handed to native, at home, the Owner's llm_token, activity drain, sign-out | Unit-tested hand-over |
| M3 | 4.1 Messages tab with badge, 4.2 Thread with Send, deep links | Messages read and answered from the app |
| M4 | Catch-up, reply drafts, rewrite, Read aloud, Ask about it; 3.1 / 3.2 cards and the Listening chip | AI help at home |
| M5 | 4.3 Spoken alerts, VIP editor, 5.1 rows, Welcome home and Home server not answering, Summary mode | The Owner controls alerts |
| M6 | Device QA against Laravel, status doc | §10 ticked or explained |

Each phase ends with typecheck, lint and Jest passing, and a commit.

---

## 9. Decisions to confirm

1. **The alert engine is native**, in the listener's process, so no JS runtime starts per
   notification and alerts work with the app closed. JS keeps screens, Laravel and zypherLL.
2. **Capture is from notifications only**, SMS included (the default SMS app's notification). That
   matches Laravel's `match_key` ("the sender name as it appears in notifications") and gives SMS a
   Reply action without `SEND_SMS`. `READ_SMS` / `RECEIVE_SMS` from 1.5 stay unused for now.
3. **Messages stay 7 days on the phone**, at most 2,000, encrypted with a Keystore key. Nothing is
   uploaded.
4. **Held alerts aren't spoken later.** Quiet hours, away or no headphones post the missed
   notification silently; arriving home offers the catch-up.
5. **Captured messages only go to the local engine**, never Mark-L (Gemini), with web and memory
   off.
6. **"Reply by voice" is "Reply"** until 3.6 Voice exists; it opens 4.2.
7. **Summary mode needs the Owner's session**: native gets the llm_token in memory while the Owner
   is unlocked. Otherwise, and away, it reads the full message (the canvas's fallback).
8. **"Still speak urgent ones" maps to `urgent_keywords`**: on is `["urgent", "call me"]`, off is
   `[]`. Laravel has no separate switch.
9. **Messages is the Owner's**: the tab, 3.1 / 3.2 cards, 4.3 and 5.1's rows are hidden for other
   profiles. Alerts still speak whoever is unlocked, since they are the phone's.
10. **Read** means the source notification left the tray (opened or dismissed) or 4.2 opened.
11. **No search** on 4.1 yet; the button is left out rather than drawn dead.
12. **Activity events** carry VIP names and counts, never message text.

---

## 10. QA checklist

- [ ] With notification access on, an SMS (`adb emu sms send`) shows in 4.1 within seconds, with
      the source badge, and in 4.2.
- [ ] A VIP's unread message is spoken after the chosen minutes; opening it first keeps Aster quiet.
- [ ] Quiet hours, "Only speak at home" away and "Headphones or car only" on the speaker post the
      missed notification silently; an urgent word speaks during quiet hours.
- [ ] Remind in 30 min brings it back; Open opens the source app; Reply opens 4.2.
- [ ] Send in 4.2 replies through the source app's notification; nothing is sent without Send.
- [ ] At home with the model ready: the catch-up summary, suggested replies and rewrites work; away
      they are replaced by the notes, and manual replies still work.
- [ ] 4.3 saves every setting and VIP change to Laravel; the rules follow at once.
- [ ] Welcome home appears on arriving home with unread VIP messages; Home server not answering
      when `/health` doesn't reply.
- [ ] Member, Restricted and Guest see no Messages tab, cards or alert settings.
- [ ] Laravel receives `spoken_alert` and `reply_sent` with no message text; no message text,
      token or PIN reaches Metro's log or logcat.
- [ ] Typecheck, lint and Jest pass; the flows work on the emulator against Laravel.
