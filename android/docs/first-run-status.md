# First run: status

Where the Aster first run stands after Phase 8 (25 Sep 2026). The plan is
`docs/aster-first-run-plan.md`; section numbers below point into it.

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

Around the screens: launch routing (§5) as the pure `resolveFirstRunRoute`, the Zustand store
(persisted facts in AsyncStorage, secrets in SecureStore, tokens in memory), the mock Laravel
server, the zypherLL `/health` check (always real), the cleartext config plugin, the local Kotlin
module `modules/aster-system`, and the home geofence task.

**Phase 7 (real Laravel API) has not been done.** `src/services/api/index.ts` still throws when
`EXPO_PUBLIC_USE_MOCK_API=0`. Everything below was checked against the mock server.

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
9. **JSON shapes.** Assumed in `src/services/api/types.ts`; unconfirmed until Phase 7.
10. **Sign-out.** None yet; signing in again leaves the old device token valid.
11. **Maps provider.** react-native-maps with Google. `GOOGLE_MAPS_API_KEY` is empty in the current
    `.env`, so the map frame is blank (by design, instead of a crash); search, locate and the address
    line still work.
12. **App id.** `com.snehal.aster`.

## Known gaps

- Release build not yet seen running. The APK in `android/app/build/outputs/apk/release/` predates
  the `homeLlmHost` fix above, and was built from a stale prebuild whose native cleartext config
  allows `10.0.2.2` while `.env` has `HOME_LLM_HOST` empty. Rebuild with
  `npx expo prebuild --platform android` first, then `npx expo run:android --variant release`
  (with `JAVA_HOME` set to Android Studio's JBR).
- Phase 7 not done: no real Laravel client, so the §10 server items are verified on mocks only.
- No Maps key in `.env`: the pin, geofence circle and camera fit weren't seen on a device in this
  pass.
- "Use my current location" failed on the emulator even with location on (the fused provider had a
  fix, but `getCurrentPositionAsync` didn't return one). Search worked. Check on a real phone.
- The 1.4 Test "Ready" state wasn't seen on a device (zypherLL wasn't running); the parser is unit
  tested.
- On a 360×640 dp phone, 2.2's bottom keypad row (0 and delete) is below the fold and needs a
  scroll. Nothing clips, but a compact keypad for short screens would be better. Needs a design
  decision.
- With the keyboard open, the helper or error line under the focused field can sit just under the
  keyboard: Android's own focus scroll leaves about 19 dp, and `bottomOffset` didn't change it. The
  field itself always stays visible.
- TalkBack was checked through the accessibility tree (`uiautomator dump --compressed`), not by
  listening with TalkBack on.
- 2.2 locks on the sixth attempt: the fifth wrong PIN still reads "Wrong PIN. Try again." and the
  next one returns 429. That matches §6 ("allows 5 tries, then locks").
- Dev only: with reduced motion on, Reanimated shows a LogBox warning toast; on Windows, Metro
  sometimes misses edits and new files (restart Metro).

## How to run

```bash
cp .env.example .env        # ANDROID_PACKAGE, and ideally GOOGLE_MAPS_API_KEY and HOME_LLM_HOST
npm install
npm run android             # builds and installs the dev build
npm test && npm run typecheck && npm run lint
```

Mock triggers are listed at the top of `src/services/api/mock.ts`: for example, the password
"wrong" gives 422, an email starting with "owner" signs in to a household whose Owner has PIN
123456, and five wrong PINs lock for 30 s. In dev builds, "Reset first run" on Home clears
storage, the secure store and the mock server; long-press the Welcome wordmark for the component
gallery.

Screenshots from this pass are in `docs/screens/phase-8/` (393, 360 and 430 dp wide, and at 200 %
font size).
