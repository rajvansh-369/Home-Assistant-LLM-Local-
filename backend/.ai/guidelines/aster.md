# Aster backend

Laravel API and super-admin panel for Aster, a household assistant. The Android app is the hub: it talks to this API over HTTPS from anywhere and to zypherLL (`../llm`, on the home PC) only on home Wi-Fi. Laravel never calls zypherLL. Laravel stores household accounts, profiles and PIN hashes, devices, encrypted chat history, reminders, VIP contacts and alert settings, the home place, location history and the activity log. It never stores assistant memory, captured WhatsApp/Google Chat/SMS messages or Guest chats. Many households share one install; each llm_token is an RS256 JWT whose `aud` claim ("h7") ties it to one household. The admin panel (Filament, `/admin`) is part of this app with its own `admins` login.

## Commands
- `composer check`: tests, Pint and Larastan in turn. Must pass at the end of every phase.
- `composer test` / `composer lint` / `composer stan`: each on its own. `vendor/bin/pint` fixes style.
- `php artisan serve`, then `GET /up` for the health check.
- `php artisan migrate:fresh --seed`: rebuild the local SQLite database.

## Layout
- `app/Console/Commands/`: aster:jwt-keys, aster:create-admin, aster:prune
- `app/Enums/`: string-backed enums
- `app/Filament/`: admin panel resources, pages and widgets
- `app/Http/Controllers/Api/`: one controller per API area
- `app/Http/Middleware/`: EnsureDeviceToken, EnsureProfileToken, EnsureOwner, EnsureNotGuest, AdminIpAllowlist
- `app/Http/Requests/`, `app/Http/Resources/`: form requests and API resources
- `app/Models/`, `app/Policies/`, `app/Services/`
- `config/aster.php`: every ASTER_* setting
- `routes/api.php`: route groups by token type; `routes/console.php`: the daily schedule
- `storage/keys/`: JWT key pair (git-ignored)
- `tests/Feature/Api/`, `tests/Feature/Admin/`, `tests/Fixtures/jwt/`
- `docs/aster-backend-plan.md`: the plan

## Rules
- `docs/aster-backend-plan.md` is the source of truth. Report any deviation instead of making it silently. Never change the API contract (§5) or the llm_token claims (§4) without asking.
- Every endpoint gets a form request, an API resource, a middleware or policy check, and Pest feature tests.
- Household data is always queried through the token's household or profile, never by a raw id from the request.
- Never log or return PINs, PIN hashes, tokens, passwords, chat text or coordinates. Never commit `storage/keys`.
- Keep SQL portable between SQLite (local, tests) and MySQL 8 (production): no raw MySQL-only SQL, no SQL date functions.
- Times in API responses are ISO 8601 UTC with `Z`.
- Finish every phase with `composer check` passing.
