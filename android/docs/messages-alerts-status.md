# Messages and spoken alerts: status

Where the fourth part of the app stands after phases M1–M6 (28 Sep 2026). The plan is
`docs/aster-messages-alerts-plan.md`; section numbers below point into it.

## What's built

| Part | Where | State |
|---|---|---|
| Message capture | `modules/aster-system`: `AsterNotificationListener.kt`, `MessageParser.kt`, `MessageText.kt` | Done. WhatsApp (and Business), Google Chat and SMS apps' notifications; MessagingStyle messages with their sender and time, else title and text; own replies, group summaries, ongoing and call notifications skipped; one-time codes flagged; a digest per message stops re-posted conversations from repeating. |
| Encrypted store | `MessageStore.kt`, `Crypto.kt` | Done. SQLite; title, sender and text sealed with AES-256-GCM by a data key that only the Keystore can unwrap; 7 days, 2,000 rows; cleared on sign-out. |
| Read and reply | listener, `AsterSystemModule.kt` | Done. A thread is read when its notification leaves the tray (opened, dismissed, cleared by the app) or 4.2 opens it; Send fills the source notification's Reply action. |
| Spoken alerts | `AlertEngine.kt`, `AlertRules.kt`, `Speaker.kt`, `AlertNotifier.kt`, `AlertReceiver.kt` | Done. VIP timers on AlarmManager (kept in the store, re-armed when the listener connects); the rules (quiet hours with urgent words, only at home, headphones only, never on a call); TextToSpeech with ducking; the silent missed notification with Reply, Remind in 30 min and Open; `spoken_alert` queued for JS. Summary mode asks the home PC's local model with the Owner's llm_token while the Owner is unlocked, else reads the full message. |
| Rules on the phone | `features/messages/alerts.ts`, `vip.ts`, `install.ts` | Done. Laravel's alert settings and VIP contacts cached and handed to native (with the wording from `copy.ts`); at home from home mode and the geofence; the Owner's llm_token in memory only; native activity events into the device queue. |
| 4.1 Messages | `(tabs)/messages`, `MessagesScreen.tsx`, `CatchUpCard.tsx` | Done. Owner only, with the VIP badge on the tab; filters, Catch-up (summary at home, Read aloud, Ask about it), VIP and Everyone else, hidden codes, the access callout, the footnote. |
| 4.2 Thread | `thread/[key]`, `ThreadView.tsx`, `ReplyAssist.tsx` | Done. Messages, the spoken marker, the suggested reply (summary, three chips, Rewrite: Shorter, Warmer, Hinglish), Send, "Sent through … at …", the gone-notification state with Open, the VIP star. |
| 4.3 Spoken alerts | `alerts`, `AlertsScreen.tsx`, `vip/[id]`, `VipEditor.tsx` | Done. Every canvas control, saved to Laravel and put back when refused; the VIP editor with "From your messages". |
| 4.4 home notices | `features/messages/notify.ts` | Done. Welcome home (with VIP messages waiting) and Home server not answering (with `server_problem`) on arriving home; Catch me up, Later, Retry and Settings. |
| 3.1 / 3.2 / 5.1 | `HomeCards.tsx`, `(tabs)/home`, `(tabs)/settings` | Done. Listening chip, Missed while you were away, the away VIP card; 5.1's Alerts and background and Privacy rows. Owner only. |

Each phase has its own commit: M1 (plan, API calls, capture and the alert engine), M2 (rules on the
phone), M3 (4.1 and 4.2), M4 (catch-up, drafts, home cards), M5 (4.3, the editor, 5.1, home
notices), M6 (this check).

## Laravel contract check (28 Sep 2026)

With curl against `php artisan serve` and the local `aster` database (test household
`phase7-app@example.test`, Owner PIN unlock):

- `GET /alert-settings` returned the eight fields the app reads (Laravel's defaults: on, 10 min,
  full, no quiet hours, no urgent words, speaker allowed, away allowed).
- `PUT /alert-settings` with quiet hours and `["urgent", "call me"]` answered 200; `25:00` answered
  422 on `quiet_start`.
- `POST /vip-contacts` answered 201 with `{ id, name, match_key, sources, enabled }`; `PATCH`
  200; `DELETE` 204.
- `POST /activity/batch` (device token) accepted `spoken_alert`, `reply_sent` and
  `server_problem` together: `{ accepted: 3, duplicates: 0 }`.
- The whole backend suite passes against MySQL: 567 tests.

## Decisions as built (plan §9)

1. The alert engine is native, in the listener's process; no JS starts per notification.
2. Capture is from notifications only, SMS included; `READ_SMS` / `RECEIVE_SMS` stay unused.
3. Messages stay 7 days on the phone, at most 2,000, sealed with a Keystore-wrapped key.
4. Held alerts aren't spoken later; they wait as the silent missed notification.
5. Captured messages only go to the local engine (Zephyr), never Mark-L, with web and memory off.
6. The notification's "Reply by voice" is "Reply" and opens 4.2.
7. Summary mode uses the Owner's llm_token only while the Owner is unlocked (memory only).
8. "Still speak urgent ones" is `urgent_keywords: ["urgent", "call me"]` or `[]`.
9. Messages, 4.3 and the 3.1 / 3.2 cards are the Owner's; alerts speak whoever is unlocked.
10. Read: the source notification left the tray (opened or dismissed) or 4.2 opened.
11. No search on 4.1.
12. Activity events carry VIP names and counts, never text; a reply to someone who isn't a VIP is
    "Replied on SMS", unnamed.

Also: a message already 30 minutes old when captured (after a restart) is kept but never alerted;
Aster never talks over a call; suggestions are only drafted when the other side wrote last.

## How to run against real servers

As in `docs/home-chat-status.md`, plus: allow notification access
(`adb shell cmd notification allow_listener <package>/expo.modules.astersystem.AsterNotificationListener`
on an emulator), and send test SMS with `adb emu sms send 5551234 "Hello"`. The Kotlin rules have
JUnit tests: `cd android && ./gradlew :aster-system:testDebugUnitTest` (JBR as JAVA_HOME). This part
needs a new dev build (`gradlew assembleDebug`); no prebuild.
