"""
Who is calling: the admin, or one profile of the household.

Two kinds of bearer token are accepted:

    ZYPHER_API_KEY    the admin: the console's owner, Postman, scripts. Sees
                      the global memory store and may change server settings.
    llm_token         an RS256 JWT Laravel signs when a profile is unlocked on
                      a phone. Verified offline with Laravel's public key. Its
                      claims decide what the call may do:

                        aud     must be this home's ZYPHER_HOUSEHOLD_ID
                        iss     "aster"
                        scope   the profile's memory folder ("p12")
                        web     "never" turns web lookups off
                        memory  false turns recall and learning off (Guest)

The phone never holds the admin key: it can read every profile's memory.

With no ZYPHER_API_KEY the server is open, as before: any call is the admin,
except that a JWT, when one is sent and the JWT path is on, is still verified
and scoped -- a phone on an open dev server keeps its own memory.
"""

import hmac
import re
from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import HTTPException, Request

from zypher import config


@dataclass(frozen=True)
class Caller:
    # Memory folder name; None is the admin's global store.
    scope: Optional[str]
    web_allowed: bool = True
    memory_allowed: bool = True

    @property
    def admin(self):
        return self.scope is None


ADMIN = Caller(scope=None)

# Laravel's clock and this PC's may disagree by a few seconds.
LEEWAY_SECONDS = 30

_key_cache = {}


def jwt_key():
    """The public key, or None with the reason printed once."""

    source = (config.JWT_PUBLIC_KEY_PATH, config.HOUSEHOLD_ID)

    if source in _key_cache:
        return _key_cache[source]

    key = None
    path, household = source

    if not path and not household:
        pass  # JWT path simply not configured: the admin key only
    elif not path:
        print("[auth: ZYPHER_HOUSEHOLD_ID is set but ZYPHER_JWT_PUBLIC_KEY is not; "
              "phone tokens are refused]")
    elif not household:
        print("[auth: ZYPHER_JWT_PUBLIC_KEY is set but ZYPHER_HOUSEHOLD_ID is not; "
              "phone tokens are refused]")
    else:
        try:
            with open(path, "r", encoding="utf-8") as handle:
                key = handle.read()
        except OSError as error:
            print("[auth: cannot read ZYPHER_JWT_PUBLIC_KEY {}: {}; phone tokens are "
                  "refused]".format(path, error))

    _key_cache[source] = key

    return key


def _from_jwt(token, key):
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=config.JWT_ISSUER,
            audience=config.HOUSEHOLD_ID,
            leeway=LEEWAY_SECONDS,
            options={"require": ["exp", "iat", "iss", "aud", "sub", "scope"]},
        )
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid or expired token")

    # The scope names a folder on disk: nothing that could leave it.
    scope = re.sub(r"[^A-Za-z0-9_-]", "", str(claims["scope"]))[:40]

    if not scope:
        raise HTTPException(401, "invalid or expired token")

    return Caller(
        scope=scope,
        web_allowed=claims.get("web") != "never",
        memory_allowed=bool(claims.get("memory", True)),
    )


def caller(request: Request) -> Caller:
    supplied = request.headers.get("authorization", "")

    # Constant-time compare, so the key cannot be recovered byte by byte from
    # response timings.
    if config.API_KEY is not None and hmac.compare_digest(
        supplied.encode(), ("Bearer " + config.API_KEY).encode()
    ):
        return ADMIN

    token = supplied[len("Bearer "):].strip() if supplied.startswith("Bearer ") else ""
    key = jwt_key()

    if key and token.count(".") == 2:
        return _from_jwt(token, key)

    if config.API_KEY is None:
        return ADMIN

    raise HTTPException(401, "invalid or missing API key")


def admin_only(request: Request) -> Caller:
    """For calls that change the server for everyone: settings."""

    who = caller(request)

    if not who.admin:
        raise HTTPException(403, "only the admin key can change server settings")

    return who
