# llm_token test fixture

A throwaway RS256 key pair and a sample llm_token, for this app's tests and
zypherLL's (`llm/`). These keys protect nothing: never use them on a real
server, and never copy the real `storage/keys` pair here.

| File | What it is |
|---|---|
| `test-jwt.key` | Test private key (signs `sample-token.txt`) |
| `test-jwt.pub` | Test public key; point zypherLL's tests at it |
| `sample-token.txt` | llm_token for household `h1`, profile 12, expiring 2099-12-31 |
| `claims.json` | The claims inside `sample-token.txt` |

zypherLL's tests should accept the sample token with `ZYPHER_HOUSEHOLD_ID=h1`
and reject it for any other household id.

Rebuild everything (new keys, new token) from `backend/`:

```sh
ASTER_REBUILD_JWT_FIXTURE=1 php artisan test --filter=JwtFixture
```
