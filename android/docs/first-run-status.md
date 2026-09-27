# First run: status

Where the Aster first run stands after Phase 7 (27 Sep 2026; Phase 8 was done first, on mocks).
The plan is `docs/aster-first-run-plan.md`; section numbers below point into it.

## What's built

| Screen | Route | State |
|---|---|---|
| 1.1 Welcome | `(first-run)/welcome` | Done. Orb sized to the free height, hidden below 96 dp; static with reduced motion. |
| 1.2 Sign in, register mode | `(first-run)/sign-in` | Done. `/up` check with the four states, https rule, error mapping, register mode on the same layout. |
| 1.3 Create Owner | `(first-run)/create-owner` | Done. Live avatar, swatches, 6-digit PIN, fingerprint by hardware, create chain, edit mode (PATCH). |
| 2.2 Unlock (first-run mode) | `(first-run)/unlock-owner` | Done. Keypad, wrong-PIN shake, 429 countdown, fingerprint key only with a stored biometric PIN. |
| 1.4 Set home | `(first-run)/set-home` | Done. Map, search, locate, radius, Wi-Fi prefill, LLM validation and Test, Save. |
| 1.5 Permissions | `(first-run)/permissions` | Done. Six rows with true status, blocked rows open settings, refresh on return, Finish and Skip. |
| 3.1 Home placeholder | `home` | Lists the saved facts, the skipped permissions and the geofence status. Reset and the gallery are dev-only. |
| 5.1 Settings (engine only) | `settings` | Opened from Home. Picks who answers chats: Local (offline, Zephyr on the home PC) or Mark-L (online, Gemini through the same PC), under the admin panel's names. Saved to Laravel when unlocked, otherwise at the next unlock. |

Around the screens: launch routing (§5) as the pure `resolveFirstRunRoute`, the Zustand store
(persisted facts in AsyncStorage, secrets in SecureStore, tokens in memory), the real Laravel
client and the mock server behind `EXPO_PUBLIC_USE_MOCK_API`, the zypherLL `/health` check (always
real), the cleartext config plugin, the local Kotlin module `modules/aster-system`, and the home
geofence task.

## Phase 7: the real Laravel API

- `src/services/api/client.ts` is the real client: `{server}/api`, JSON in and out,
  `Accept: application/json`, the route's bearer token, 15 s timeout (5 s for `GET /up`). Every
  failure becomes one `ApiError`: status 0 for no reply (with `timedOut`), Laravel's 422 field
  errors, and the 429 wait from `retry_after` or the `Retry-After` header.
- `src/services/api/index.ts` picks it when `EXPO_PUBLIC_USE_MOCK_API=0` (now the default in
  `.env.example`); `1` keeps the in-app mock. Jest always runs on the mock, except the two new
  suites below.
- `device_name` is manufacturer and model from expo-device ("Google Pixel 7"), without repeating
  a maker the model name already has, cut to Laravel's 100 characters. Sign-in and register also
  send `app_version` (the app config version), which Laravel keeps on the device row.
- The existing-household chain, the Set home prefill and the 401 sign-out ("Please sign in
  again.") were already built on the mock in Phases 2–4; they now run against Laravel unchanged.
- `scripts/dev-api.mjs` wasn't written: the Laravel app in `../backend` runs.
- Tests: `__tests__/api-client.test.ts` (URLs, headers, the `data` wrapper, 422, 429 from body and
  header, 401/403/5xx, no reply, both timeouts) and `__tests__/real-api-chains.test.ts` (the new-
  and existing-household chains of §5 and the 401 sign-out, through the real client against a
  fake Laravel that checks each route's token).

### API shapes, checked against Laravel

Read from `../backend` (routes, form requests, resources, `PinGuard`, `ProfileSessions`) and
confirmed with curl against `php artisan serve`:

| Call | What Laravel does |
|---|---|
| `POST /auth/register`, `/auth/login` | Body `name` (register), `email`, `password`, `device_name`, optional `app_version`. 201/200 `{ token, household_id, user, device }`. Wrong login: 422 on `email`, "Email or password is wrong.". Suspended: 403. Throttled: 429 with `retry_after`. |
| Register when a household exists | Only refused (403 "Registration is closed.") with `ASTER_REGISTRATION=single`. The default, `open`, lets any new email make a new household; a taken email is 422 on `email`. |
| `GET /profiles` | `{ data: [{ id, name, color, role }] }`, including the Guest Laravel creates with the Owner. |
| `POST /profiles` | Colour must be `#RRGGBB`; Laravel upper-cases it, and the app matches swatches case-blind. `auto_lock_minutes` 1–60 or null. 201 `{ data: profile }`. |
| `POST /profiles/{id}/unlock` | `{ profile_token, llm_token, expires_at, household_id, profile, engines }`, not wrapped in `data`. Wrong PIN: 422 `{ errors: { pin }, attempts_left }`; the fifth gives 429 with `retry_after` 30 (doubling for later lockouts within 24 h, up to 1 h). |
| `GET` / `PUT /places/home` | Owner profile token. 404 "No home is saved yet." when none. `PUT` is always 200. Also returns `id` and `updated_at`. |
| `PATCH /profiles/{id}` | Owner profile token (also used by 5.1 for `llm_engine`). A device token gets 403. |
| Unknown or revoked token | 401 `{ message: "Unauthenticated." }`. The wrong kind of token gets 403. |

Roles include `restricted` (types updated). Laravel now has `POST /auth/logout`; the app doesn't
call it yet (§9 decision 10).

### Device check (27 Sep 2026)

x86_64 debug build on the Android 16 emulator, Metro with `EXPO_PUBLIC_USE_MOCK_API=0`, Laravel
from `php artisan serve` on the PC (MySQL from XAMPP), server `http://10.0.2.2:8000`:

- New household (register mode): 1.3 ran register, create Owner, unlock and `GET /places/home`
  (404); Laravel stored the device as "Google sdk_gphone64_x86_64" with `app_version` 1.0.0, the
  Owner in Sky with `auto_lock_minutes` 2, and a Guest.
- Back to 1.3 (edit mode), Peach, Save profile: `PATCH /profiles/{id}` with the profile token.
- 1.4: search, map, circle and Wi-Fi prefill ("AndroidWifi"); Save home stored the place. 1.5
  Skip reached Home.
- 5.1 Settings: Mark-L showed "Saved." and the profile's `llm_engine` became `markl` on Laravel.
- Reset first run, then sign in to the same household: a wrong password shows "Email or password
  is wrong."; the right one goes to 2.2 with the Owner. Four wrong PINs read "Wrong PIN. Try
  again.", the fifth locks with a countdown; after it, the right PIN opens 1.4 prefilled from
  Laravel (address, 150 m, Wi-Fi, LLM address).
- Device token deleted on the server, then Sign in: `GET /profiles` got 401 and 1.2 shows
  "Please sign in again." with the token gone.
- No password, PIN or token in the Metro log or logcat.
- Found and fixed: after a failed server check, leaving the field didn't check the same address
  again, so one slow reply stuck as "Can't reach this server" until the address was edited. The
  first `/up` from the emulator to `php artisan serve` took 10 s (the PHP dev server; later ones
  took ~0.1 s), which is how it showed up.

Screenshots: `docs/screens/phase-7/`.

## Phase 8 changes

- Accessibility
  - Text fields: the visible label and helper are skipped by TalkBack; the input reads its label,
    then the helper, status or error as its hint. Error and status lines stay live regions.
  - 1.4: "Home area" is read once (the radio group carries it).
  - 2.2: the Owner badge is read as "Owner", not the upper-cased "OWNER".
  - Home placeholder: one TalkBack stop per fact ("Server, https://…").
- Large text (200 %)
  - Inputs and the 1.4 search bar are capped at 1.3×, like titles and buttons. Their placeholders
    wrapped and were cut off inside the fixed-height fields. This extends §2's capped list.
  - 1.5: above 1.3× the Allow pill or Allowed chip moves under the row's text; before, it squeezed
    the titles until words broke ("Notifi / cation").
  - Text links centre their label when it wraps.
- Keyboard: Next on the 1.3 Name field now moves to the PIN (it used to close the keyboard).
- Errors say what to do next
  - 1.3 and 1.4 no longer show the server's raw message (for example "Server Error"). A network
    failure reads "Can't reach your Aster server. Check your connection and try again." (proposed),
    a 429 reuses the 1.2 wording, a 422 shows Laravel's message, and anything else the generic line.
  - 1.4 Test: "Model failed to load: {error}. Check zypherLL on your computer."; blocked hosts add
    "Use that address, or https://." (all proposed).
  - 1.4: a stale "Location is off" line clears when a new search or locate starts.
- 2.2: the footer note keeps a 16 dp gap when the keypad pushes it down on short phones.
- Home placeholder: shows "Permissions not allowed yet", "Home geofence" (from
  `hasStartedGeofencingAsync`) and the last geofence event, so §10's geofence item can be checked
  on the device.
- Tests: new screen tests for 1.1, 1.3 and Home; the 1.5 and 2.2 tests were brought up to date with
  the Phase 5–6 behaviour (hidden Allowed chip, no fingerprint key after a fresh sign-in).
- Clean-up: `modules/*/android/build/` is ignored.
- Release fix: Expo's config serializer embeds a `null` value as `{}` in the release APK's
  `app.config`, so `extra.homeLlmHost` arrived as `{}` and `buildConfig.ts` threw on `.trim()` as
  soon as a route imported it. `app.config.ts` now passes an empty string, and `buildConfig.ts`
  accepts strings only (`__tests__/build-config.test.ts`).

### Proposed strings, reviewed

Kept as the plan has them, except these, which now say what to do next:

| Where | Plan | Now |
|---|---|---|
| 1.2 server | "Can't reach this server" | "Can't reach this server. Check the address." |
| 1.4 search | "No match for “{query}”" | "No match for “{query}”. Try a fuller address." |
| 2.2 | "Wrong PIN" | "Wrong PIN. Try again." |
| 1.4 Test | "Model failed to load: {error}" | adds "Check zypherLL on your computer." |
| 1.4 Test | "This build only allows plain HTTP to {HOME_LLM_HOST}." | adds "Use that address, or https://." |

Added proposed strings: `common.noConnection`, `createOwner.fingerprintLater`,
`setHome.llmInvalid`, `setHome.llmReadyNoModel`, `setHome.llmBlockedAll`, `setHome.llmUnexpected`,
`permissions.restrictedHint`, and the Home placeholder facts.

## §9 decisions, as built

1. **Household account at 1.3.** Register mode's Continue only validates; Create profile calls
   `register` with the Owner's name, then creates the Owner and unlocks.
2. **Fingerprint unlock.** After unlock, the PIN is saved in SecureStore with
   `requireAuthentication`; a cancelled prompt turns the switch off. 2.2 shows the fingerprint key
   only when this phone holds that PIN; a fresh sign-in on a new phone clears it.
3. **PIN length.** 6 digits.
4. **No "confirm PIN".** Still a single field, so a typo locks the Owner out until there's a reset
   path. Open.
5. **Auto-lock during setup.** Only the preference is stored; nothing arms it before Home.
6. **Server check.** `GET {server}/up`, 5 s.
7. **Cleartext host.** `HOME_LLM_HOST` from `.env` at build time, through
   `plugins/with-home-llm-cleartext.js`. It is empty in the current `.env`, so a release build
   refuses all plain HTTP and 1.4 says so.
8. **Geofence timing.** Registered when 1.5 sees "Allow all the time" with a saved home, after Save
   home if already allowed, and on every app start.
9. **JSON shapes.** Confirmed against the Laravel controllers in Phase 7 (table above); kept in
    `src/services/api/types.ts`.
10. **Sign-out.** Laravel now has `POST /auth/logout`, but the app has no sign-out yet, so signing
    in again leaves the old device token valid.
11. **Maps provider.** react-native-maps with Google. `GOOGLE_MAPS_API_KEY` is empty in the current
    `.env`, so the map frame is blank (by design, instead of a crash); search, locate and the address
    line still work.
12. **App id.** `com.snehal.aster`.

## Release build and Phase 6 device check (25 Sep 2026)

Built with `HOME_LLM_HOST=10.0.2.2` (the emulator's address for the host PC), after a fresh
`npx expo prebuild --platform android`, as an x86_64-only release APK
(`gradlew assembleRelease -PreactNativeArchitectures=x86_64`, 11 min instead of 59 for all four
ABIs). Run on the Android 16 emulator (API 36.1; no Android 14 or 15 image is installed):

- The APK carries `homeLlmHost: "10.0.2.2"`, and its network security config allows cleartext only
  to `10.0.2.2`.
- The release app starts, and a full first run works on the mock server: register, 1.3, 1.4, 1.5,
  then Home. Killing and reopening lands on Home. No crash, and nothing sensitive in the JS log.
- 1.4 Test against a stand-in `/health` on the PC (`http://10.0.2.2:8000`) reads
  "Ready · fake-zephyr-7b · 967 ms". `http://192.168.1.20:8000` is refused with "This build only
  allows plain HTTP to 10.0.2.2…" and no request is sent.
- Search found an address, and the Wi-Fi field filled with the emulator's "AndroidWifi".
- 1.5, every row:
  - SMS, microphone and contacts open Android's own dialogs.
  - Location opens Aster's location settings, where "Allow all the time" was chosen.
  - Notification access opens Aster's page in Notification access. Afterwards the system lists
    `AsterNotificationListener` as enabled.
  - Run in background asks for notifications first, then shows the battery dialog. Aster then
    appears on the battery whitelist (Unrestricted).
  - Each chip turned to Allowed on return.
- Home shows "Home geofence: On" and a real event from the background task: "Left", because the
  emulator's GPS is in Mountain View. After a relaunch it is still On.
- Found while checking: after Test on a refused host, the refusal was shown twice, under the field
  and on the Test line. The field line now steps aside once the Test line says it.

Screenshots: `docs/screens/phase-6/` and `docs/screens/phase-8/393-release-*`.

## Known gaps

- Release was checked only as an x86_64 build on the emulator, not on a real phone, and only with
  a test `HOME_LLM_HOST`. A build for your home network needs `HOME_LLM_HOST` in `.env`, then
  prebuild and a normal all-ABI release build.
- Expo Go opens the app, but only for UI checks. It lacks `modules/aster-system` and TaskManager,
  so Notification access, battery and the geofence do nothing there (a dev warning says so), and
  SMS and background location may be refused. Use a development build for 1.5.
- Dev builds allow plain http only to `localhost` and `10.0.2.2` (§4.2), so a phone can't use
  `http://192.168.x.x:8000` for a Laravel on the PC. Use `adb reverse tcp:8000 tcp:8000` and
  `http://localhost:8000`, or an https address.
- No Maps key in `.env`: the pin, geofence circle and camera fit weren't seen on a device in this
  pass.
- "Use my current location" failed on the emulator even with location on (the fused provider had a
  fix, but `getCurrentPositionAsync` didn't return one). Search worked. Check on a real phone.
- The 1.4 Test "Ready" state was seen only against a stand-in `/health`, not the real zypherLL
  (a 7B model doesn't fit in RAM next to the emulator here).
- On a 360×640 dp phone, 2.2's bottom keypad row (0 and delete) is below the fold and needs a
  scroll. Nothing clips, but a compact keypad for short screens would be better. Needs a design
  decision.
- With the keyboard open, the helper or error line under the focused field can sit just under the
  keyboard: Android's own focus scroll leaves about 19 dp, and `bottomOffset` didn't change it. The
  field itself always stays visible.
- TalkBack was checked through the accessibility tree (`uiautomator dump --compressed`), not by
  listening with TalkBack on.
- 2.2 locks on the fifth wrong PIN: Laravel's `PinGuard` answers it with 429 itself. The mock
  used to lock one try later; it now matches.
- Dev builds with an `http://` server show "Reachable · HTTPS · {ms} ms" (the canvas string); only
  https is reachable in release builds, so this is dev-only.
- Dev only: with reduced motion on, Reanimated shows a LogBox warning toast; on Windows, Metro
  sometimes misses edits and new files (restart Metro).

## How to run

```bash
cp .env.example .env        # ANDROID_PACKAGE, and ideally GOOGLE_MAPS_API_KEY and HOME_LLM_HOST
npm install
npm run android             # builds and installs the dev build
npm test && npm run typecheck && npm run lint
```

Against the real Laravel on this PC (`EXPO_PUBLIC_USE_MOCK_API=0`): start MySQL, then
`php artisan serve --port=8000` in `../backend`. On the emulator enter `http://10.0.2.2:8000` at
1.2; on a USB phone run `adb reverse tcp:8000 tcp:8000` and enter `http://localhost:8000`.
Changing `EXPO_PUBLIC_*` values needs a Metro restart with `--clear`.

With `EXPO_PUBLIC_USE_MOCK_API=1`, mock triggers are listed at the top of `src/services/api/mock.ts`: for example, the password
"wrong" gives 422, an email starting with "owner" signs in to a household whose Owner has PIN
123456, and five wrong PINs lock for 30 s. In dev builds, "Reset first run" on Home clears
storage, the secure store and the mock server; long-press the Welcome wordmark for the component
gallery.

Screenshots from this pass are in `docs/screens/phase-8/` (393, 360 and 430 dp wide, and at 200 %
font size).
