# Profiles, memory and activity: status

Where the fifth part of the app stands after phases P1–P6 (1 Oct 2026). The plan is
`docs/aster-profiles-memory-plan.md`; section numbers below point into it.

## What's built

| Part | Where | State |
|---|---|---|
| API calls | `services/api` (client, mock, types), `services/llm/memory.ts` | Done. `GET /profiles/{id}`, Owner `POST /profiles`, `PATCH`/`DELETE /profiles/{id}`, `GET`/`PATCH /me`, `GET`/`DELETE /activity`, `DELETE /conversations`; zypherLL's `/v1/memory` overview, notes, add, forget one, forget all, with the llm_token and the profile's engine. |
| 2.3 Profiles | `profiles.tsx`, `ProfilesScreen.tsx`, `manage.ts` | Done. Every profile with its role tag and summary, "Allow guest sessions", "Add a profile", "How profiles stay private". Owner only. |
| 2.4 Edit profile | `profile/[id].tsx`, `ProfileEditor.tsx` | Done. Add (name, colour, role, PIN, switches, answer style, web lookups, auto-lock) and edit, each change saved at once and put back if refused; Change PIN; Delete with a confirm dialog. |
| Chat off | `chat/ask.ts`, `useChat.ts` | Done. Unlock without an llm_token; a chat says "The Owner has turned chat off for your profile." |
| 2.1 without Guest | `who.tsx`, `profiles/store.ts` | Done. Guest's card is hidden while guest sessions are off. |
| 5.2 Memory and activity | `memory.tsx`, `features/memory/` | Done. "Remember things about me" (Laravel, then a fresh llm_token); notes with Forget and Add, learned answers and Forget everything at home with the model ready; "Memory is off" and the at-home footnote otherwise; the activity log by day with "Clear log". |
| 5.1 Privacy and Your data | `(tabs)/settings.tsx`, `settings/actions.ts` | Done. Profiles (Owner), Auto-lock, Hide message text (Owner), Memory and activity, "Delete all of {name}'s chats". Every profile but Guest. |

Each phase has its own commit: P1 (plan, API calls, memory client), P2 (2.3), P3 (2.4, chat off),
P4 (5.2), P5 (Auto-lock, Your data), P6 (this check). Laravel's side (B1–B6) is the backend
commit "profile switches, GET /profiles/{id}, and clearing chats and activity".

## Laravel and zypherLL contract check (1 Oct 2026)

With a script against `php artisan serve` (MySQL, local `aster` database, test household
`phase7-app@example.test`) and zypherLL with Mark-L only, verifying the phone's llm_tokens:

- `GET /profiles` sends `chat_enabled`; `GET /profiles/{id}` (Owner) the full profile.
- Guest's `chat_enabled: false`: `/guest-sessions` 403 "Guest sessions are turned off."; on again: 200.
- A Member with chat and history off: unlock 200 with `llm_token: null`; `/llm-token` 403;
  `POST /conversations` 403; `PATCH /me { history_enabled }` 422.
- `DELETE /activity` 204, `DELETE /conversations` 204, then both lists empty.
- zypherLL with the Member's llm_token: overview, add a note, list, forget one (`removed: 1`);
  with `memory_enabled` off and a fresh token, 403 "memory is off for this profile".
- The backend suite passes against MySQL: 598 tests.

## Device check (emulator, 1 Oct 2026)

Against the same servers, Owner "Phase Seven" and "Test Member" (screens in
`docs/screens/profiles-memory/`):

- 5.1 Privacy as drawn for the Owner (Profiles 3, Auto-lock, Hide message text, Memory and
  activity) and for the Member (no Profiles, no Hide message text); Your data for both.
- 2.3: summaries from Laravel; "Allow guest sessions" off reached Laravel and 2.1 hid Guest.
- 2.4: added "Kiran" (Restricted, PIN); it showed on 2.3; Precise and history off saved at once;
  deleted after the dialog (soft-deleted on Laravel).
- 5.2: a note added, shown and forgotten on the home PC; memory off reached Laravel and the screen
  said "Memory is off"; back on. The log showed the household's events by day (times in IST).
- Auto-lock Off and back to After 2 min reached Laravel. "Delete all of Test Member's chats"
  answered "Your chats are deleted."
- No token or PIN in logcat or Metro's log.

Fixed during the check: the empty-name history line read "only in their's profile"; the confirm
dialogs' button repeated the whole title (now "Delete"); the Auto-lock dialog had no body line.

Not seen on the device:

- The away view of 5.2 ("Memory can only be viewed and changed at home."): this AVD never
  delivers geofence events (see `docs/reminders-location-status.md`), so home mode stayed ready
  with Wi-Fi off. Jest covers it.
- Learned answers on the local engine: the home PC ran Mark-L only (6 GB free RAM), so the card
  showed "notes kept by Mark-L". Jest covers the local wording.

## Decisions as built (plan §6)

1. Built against the proposed contract; Laravel then gained B1–B6 the same day, so nothing is
   hidden today. An older Laravel still gets the fallbacks (405 → summaries only, no Guest
   switch, "Your server needs an update…").
2. Restricted means web `never` through the llm_token; 2.4 shows "Always off for Restricted
   profiles."
3. 5.2 is for every profile but Guest; the Owner's log also has the phone's events.
4. Memory follows the profile's engine (Local or Mark-L).
5. Deleting a profile soft-deletes it on Laravel; its memory folder stays on the home PC, as the
   dialog says.
6. The Owner's own row on 2.3 doesn't open 2.4.

Also as built: pickers on 2.4 are segmented controls, the PIN is 1.3's field, "Add a note" opens
a field in place, Auto-lock opens a two-choice dialog.

## Still open

- `memory_used` activity events ("Used Mom's WhatsApp messages in a chat") aren't sent yet.
- zypherLL refuses reading and forgetting memory while it is off (403); proposed: allow GET and
  DELETE then.
- 3.6 Voice, so no "Voice and wake word" row on 2.4.

## How to run against real servers

As in `docs/home-chat-status.md`. zypherLL needs `ZYPHER_JWT_PUBLIC_KEY` and
`ZYPHER_HOUSEHOLD_ID` for the memory routes; `ZYPHER_LOCAL_MODEL=off` runs Mark-L only. JS only:
the installed dev build is enough (no native changes in P1–P6).
