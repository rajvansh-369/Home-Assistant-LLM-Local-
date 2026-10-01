# Aster profiles, memory and activity in React Native: plan and phases

The fifth part of the app, after the first run (`docs/aster-first-run-plan.md`), home mode with
chat (`docs/aster-home-chat-plan.md`, H1–H7), reminders and location
(`docs/aster-reminders-location-plan.md`, R1–R6) and messages and spoken alerts
(`docs/aster-messages-alerts-plan.md`, M1–M6). This is step 6 of the build order in
`../backend/aster-app-flow.md` ("Memory screen, location history screen and polish"; 5.3 Location
came whole in R5), plus 2.3 Profiles and 2.4 Edit profile, which every earlier plan left for later.

Sources, in order of authority:

- Design canvas (2.3 Profiles, 2.4 Edit profile, 5.1 Settings' Privacy section, 5.2 Memory and
  activity): https://claude.ai/artifact/9o4pyECfESN5n4YbcpZnj5
- Integration spec ("Screens and their APIs", "Tokens and privacy"):
  https://claude.ai/code/artifact/9f125718-f276-42cb-bd93-c8f45d7d2881
- Laravel contract: `../backend/docs/aster-backend-plan.md` §4 (roles) and §5 (`/profiles`, `/me`,
  `/activity`; routes in `../backend/routes/api.php`)
- zypherLL memory routes: `../llm/zypher/view/api/routes.py` (`/v1/memory`, `/v1/memory/records`,
  `/v1/memory/notes`, `DELETE /v1/memory/{id}`, `DELETE /v1/memory?selector=all`), called with the
  profile's llm_token; the token's `scope` picks the folder.

Canvas strings are copied exactly. Strings the canvas doesn't have are marked *(proposed)*.
Canvas sample people and data (Rohan, Meera, "Goa trip", "37 answers", …) are never defaults.

## Contents

1. Scope
2. Backend gaps
3. Architecture
4. Screens
5. Phases
6. Decisions to confirm
7. QA checklist

---

## 1. Scope

### In scope

- 2.3 Profiles (Owner only, from 5.1 Privacy "Profiles"): every profile with its role tag and a
  one-line summary, Guest's "Allow guest sessions" switch, "Add a profile", "How profiles stay
  private".
- 2.4 Edit profile (Owner only) for Member and Restricted profiles, and the same screen to add one:
  name and colour, role (Member / Restricted), what the profile can use, Answer style, Web lookups,
  PIN, Auto-lock, and "Delete {name} and their chats".
- 5.2 Memory and activity (every profile but Guest, from 5.1 Privacy): "Remember things about me",
  notes about you (forget one, add one), learned answers with "Forget everything", and the activity
  log with "Clear log". Memory only at home; the activity log anywhere.
- 5.1 Settings' Privacy section as drawn: "Profiles" with its count (Owner), "Auto-lock",
  "Memory and activity", and "Your data" / "Delete all of {name}'s chats".

### Out of scope (later steps)

- 3.6 Voice and the wake word, so 2.4's "Voice and wake word" row and 5.1's Voice section stay out.
- 5.1's "Personality" row and the Owner editing their own profile beyond what 5.1 already has.
- Paging the activity log past its first page *(proposed: "Show more" if Laravel sends a cursor)*.

---

## 2. Backend gaps

Checked on 1 Oct 2026 against `routes/api.php`, the form requests and resources. Each gap blocks
one control; the app is built against the proposed contract and the control stays hidden until the
server answers it (a 404 or 405 hides it, never an error on screen).

| # | Canvas control | What Laravel has | Proposed for Laravel |
|---|---|---|---|
| B1 | 2.3 row summaries, 2.4's current values | `GET /profiles` sends `{ id, name, color, role }` only; the Owner can't read another profile's settings | `GET /profiles/{id}` (Owner) returning `ProfileResource` |
| B2 | 2.3 Guest "Allow guest sessions" | Nothing; `/guest-sessions` always opens | `users.guest_enabled` (default true), in `GET`/`PUT /household` or on the Guest profile via `PATCH /profiles/{guest}`; `/guest-sessions` answers 403 when off; `GET /profiles` hides or flags Guest |
| B3 | 2.4 "Keep chat history" | Nothing; every chat uploads | `profiles.history_enabled` (default true) in `ProfileResource`, `PATCH /profiles/{id}` and `/me`; `POST /conversations/*` answers 403 when off |
| B4 | 2.4 "Chat with Aster" | Nothing | `profiles.chat_enabled` (default true); `/llm-token` and unlock leave out `llm_token` (or zypherLL refuses chat via a `chat: false` claim) when off |
| B5 | 5.2 "Clear log" | `GET /activity` only | `DELETE /activity` (profile token): the profile's own events; the Owner's also clears device events |
| B6 | 5.1 "Delete all of {name}'s chats" | `DELETE /conversations/{id}` one at a time | `DELETE /conversations` (profile token): every conversation of the profile, tombstoned for sync |
| B7 | 2.4 PIN for the Owner's own profile | `PATCH /me` with `pin` and `current_pin` (works) | none |

**Built in Laravel on 1 Oct 2026** (`ProfileSwitchesTest`), as:

- B1 `GET /profiles/{id}` (Owner), the full Profile with `chat_enabled` and `history_enabled`.
- B2 is the Guest profile's `chat_enabled`: the Owner sends `PATCH /profiles/{guest} {
  chat_enabled }`; off, `/guest-sessions` answers 403 "Guest sessions are turned off." and open
  Guest sessions end. `GET /profiles` now also sends `chat_enabled`, so 2.1 can hide Guest.
- B3 `history_enabled`: off, `POST /conversations` and `POST /conversations/{id}/messages` answer
  403 "Chat history is turned off for this profile."; old chats stay readable. The app must stop
  queueing uploads for such a profile instead of retrying the 403.
- B4 `chat_enabled`: off, unlock answers `llm_token: null`, `POST /llm-token` answers 403, and the
  profile's open sessions end. The Owner's chat can't be turned off. `UnlockResponse.llm_token`
  becomes `string | null` in the app (P3), with chat hidden while it is null.
- `chat_enabled` and `history_enabled` are the Owner's: `PATCH /me` refuses them (422).
- B5 `DELETE /activity` and B6 `DELETE /conversations`, both 204, as proposed.

Also worth a look on the server side (not blocking):

- A new `ActivityType`, `memory_used` ("Used Mom's WhatsApp messages in a chat", 5.2), for when
  "Ask about it" puts captured messages in a private chat. The column is a free string, so no
  migration; the admin panel's type filter needs it.
- zypherLL answers 403 on every memory route while the profile's memory is off, so 5.2 can't show
  or forget old notes after "Remember things about me" is turned off. Proposed: allow `GET` and
  `DELETE` on memory routes when `memory: false`, refuse only writes.

---

## 3. Architecture

### Routes (expo-router)

```text
src/app/
  profiles.tsx               2.3 Profiles (Owner only)
  profile/[id].tsx           2.4 Edit profile: `new` or a profile id (Owner only)
  memory.tsx                 5.2 Memory and activity (not Guest)
```

### JS

| Path | Holds |
|---|---|
| `src/services/api` | `getProfile` (B1), `createProfile` with the Owner's token, `updateProfile` with every field, `deleteProfile`, `getMe`, `updateMe` with every field, `listActivity`, `clearActivity` (B5), `deleteAllConversations` (B6). Real client and mock. |
| `src/services/llm/memory.ts` | zypherLL memory: `memoryOverview`, `listNotes`, `addNote`, `forgetRecord`, `forgetAll`, with the llm_token and the profile's engine |
| `src/features/profiles/` | `manage.ts` (2.3 / 2.4 actions, the profiles cache refreshed after each change), `ProfilesScreen.tsx`, `ProfileEditor.tsx`, `copy.ts` additions |
| `src/features/memory/` | `memory.ts` (zustand: overview, notes, busy states), `activity.ts` (first page of `/activity`, icons per type), `MemoryScreen.tsx`, `copy.ts` |

### Tokens

All 2.3 / 2.4 calls use the Owner's profile token. 5.2 uses the unlocked profile's profile token
(Laravel) and llm_token (zypherLL). Turning memory on or off is `PATCH /me { memory_enabled }`
followed by `POST /llm-token`, because the `memory` claim is fixed when the token is made.

---

## 4. Screens

### 2.3 Profiles (Owner only)

- Header "Profiles", back to 5.1. "Only the Owner can add, change or remove profiles."
- One card per profile, from `GET /profiles` and (B1) each profile's settings:
  - Owner: avatar, name, "Owner" tag, "you", "PIN + fingerprint · Reads phone messages" ("PIN ·
    Reads phone messages" without fingerprint *(proposed)*). Not tappable.
  - Member / Restricted: avatar, name, role tag, a summary built from "PIN", "Chat and voice"
    (only "Chat" until voice exists *(proposed)*), "History kept" / "No history" *(proposed)* (B3);
    chevron, opens 2.4. Before B1, the summary is just "PIN".
  - Guest: dashed avatar, "Guest" tag, "No PIN · Chat only · Wiped when it ends", the "Allow guest
    sessions" switch (B2; hidden until Laravel has it).
- "Add a profile" opens 2.4 with `new`.
- "How profiles stay private": the four canvas lines; the auto-lock line uses the Owner's minutes
  ("Aster locks after 2 minutes in the background and asks again.").

### 2.4 Edit profile (Owner only)

- Header "Edit profile" ("Add a profile" for `new` *(proposed)*).
- Avatar in the profile's colour, "Name" (max 40), and the 1.3 swatch picker *(proposed: the
  canvas shows no colour control; the avatar needs one when adding)*.
- "Role": Member / Restricted segmented, with "Restricted turns off web lookups, reminders and
  message actions."
- "{name} can use": "Chat with Aster" (B4), "Keep chat history" / "Saved on your server, only in
  {name}'s profile" (B3), "Read this phone's messages" / "WhatsApp, SMS, Google Chat" with "Owner
  only" (static). Rows whose field Laravel lacks are hidden.
- "Answers and security": "Answer style" (Auto, Precise, Balanced, Creative → `sampling`), "Web
  lookups" (Auto / Off → `web_mode`; "Always off for Restricted profiles." for Restricted), "Auto-lock"
  ("After 2 min" / "Off", as 1.3's "Lock when I leave"), and "PIN" with "Change PIN". *As built
  (P3): segmented controls instead of rows opening pickers, and 1.3's PIN field instead of a
  keypad sheet.*
- Adding: Name, colour, role and PIN are required; "Create profile" *(proposed)* posts
  `POST /profiles` with the Owner's token.
- "Delete {name} and their chats" (the canvas's "her" becomes "their"): a confirm dialog, then
  `DELETE /profiles/{id}`, back to 2.3.
- Saves each change as it is made (`PATCH /profiles/{id}`), like 4.3; a refused change is put back
  with the server's message.

### 5.2 Memory and activity (not Guest)

- Header "Memory and activity", back to 5.1.
- "Remember things about me" / "Kept on your home computer, only for {name}" switch
  (`memory_enabled`; works away too, since it is Laravel).
- At home with the model ready:
  - "Notes about you": each note's text with a "Forget this" button; "Add a note" opens a one-line
    sheet *(proposed)*. Empty: "No notes yet. Aster adds them when you tell it about yourself."
    *(proposed)*
  - "Learned answers": "{n} answers learned from your chats" / "{rated} rated · rate answers in
    chat to rank them"; "Forget everything" with a confirm dialog (`DELETE /v1/memory?selector=all`).
    Mark-L keeps no answers, so with Mark-L the card reads "{n} notes kept by Mark-L" *(proposed)*.
- Away or not ready: the two memory sections are replaced by the footnote's line, "Memory can only
  be viewed and changed at home."
- "Activity log": the newest 50 events from `GET /activity`, time and an icon per type
  (spoken_alert, reminder_fired, arrived_home, left_home, server_problem, reply_sent, memory_used),
  the server's `summary` as the text; days separated by a date line *(proposed)*. "Clear log" (B5)
  with a confirm dialog; hidden until Laravel has it.

### 5.1 Settings: Privacy

- "Profiles" with the count of profiles other than Guest (Owner only) → 2.3.
- "Auto-lock" / "After 2 min" or "Off" → toggles the unlocked profile's `auto_lock_minutes`
  through `PATCH /me` *(proposed: a row with a value, as drawn, opening a two-choice sheet)*.
- "Hide message text on lock screen" (built in M5, Owner only).
- "Memory and activity" → 5.2 (not Guest).
- "Your data": "Delete all of {name}'s chats" (B6), confirm dialog, then the local chat cache is
  cleared too. Hidden until Laravel has it.

---

## 5. Phases

| Phase | Builds | Result |
|---|---|---|
| P1 | Plan; API calls (real and mock) for profiles, /me, activity; zypherLL memory client | Unit-tested calls |
| P2 | 2.3 Profiles and 5.1's Profiles row; 2.1 hides Guest while guest sessions are off | The Owner sees the household (rows open 2.4 and "Add a profile" appears in P3, with the route) |
| P3 | 2.4 Edit profile: add, edit, PIN, delete | The Owner manages profiles |
| P4 | 5.2 Memory and activity, 5.1's Memory and activity row | Memory and the log on the phone |
| P5 | 5.1 Privacy: Auto-lock, Your data; the backend gaps B1–B6 switched on as Laravel adds them | 5.1 as drawn |
| P6 | Device QA against Laravel and zypherLL, status doc | §7 ticked or explained |

Each phase ends with typecheck, lint and Jest passing, and a commit.

---

## 6. Decisions to confirm

1. **Build against the proposed contract** (§2) and hide each control until Laravel answers it,
   rather than wait for the backend.
2. **Restricted means web `never`** through the llm_token's `web` claim (backend plan §4), whatever
   `web_mode` says; the Web lookups row shows "Off" locked for Restricted and the profile's own
   `web_mode` again for Member.
3. **5.2 is for every profile but Guest**, each seeing their own memory and log, as the integration
   spec's "Own chats, settings and activity" says. The Owner also sees device events.
4. **Memory follows the profile's engine**: local (Zephyr) and Mark-L keep separate memories; 5.2
   shows the one that answers the profile's chats now.
5. **"Delete {name} and their chats"** soft-deletes on Laravel (30 days, then gone); zypherLL's
   memory folder for that profile is left on the home PC *(proposed: say so in the dialog)*.
6. **The Owner's own row on 2.3 isn't editable**; their name, colour and PIN change from 5.1's
   profile card *(proposed: later)*.

---

## 7. QA checklist

- [ ] The Owner sees 2.3 from 5.1 with every profile; Member and Restricted don't see the row.
- [ ] Adding a Member with a PIN shows it on 2.1 Who's using; unlocking it works.
- [ ] Changing a profile's role, answer style, web lookups and auto-lock reaches Laravel; the next
      unlock of that profile follows them (llm_token `web` claim).
- [ ] A PIN change is refused for a wrong format and works for the new PIN at the next unlock.
- [ ] Deleting a profile removes it from 2.1 and 2.3; its open session on this phone ends.
- [ ] 5.2 at home lists notes, forgets one, adds one and forgets everything; away it shows the note.
- [ ] Turning memory off reaches Laravel and a new llm_token says `memory: false`.
- [ ] The activity log shows the phone's events (arrived home, spoken alert, reminder) with no
      message text.
- [ ] Controls behind B1–B6 stay hidden against today's Laravel and appear once it has them.
- [ ] Typecheck, lint and Jest pass; the flows work on the emulator against Laravel.
