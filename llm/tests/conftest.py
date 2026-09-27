"""Shared test setup: the backend's throwaway JWT fixture, and a clean config."""

import json
import os
import pathlib
import time

import jwt
import pytest

from zypher import config
from zypher.view.api import auth

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "backend" / "tests" / "Fixtures" / "jwt"


def fixture_file(name):
    path = FIXTURES / name

    if not path.exists():
        pytest.skip("backend JWT fixture not found at {}".format(FIXTURES))

    return path


@pytest.fixture
def jwt_fixture(monkeypatch):
    """zypherLL configured for household h1 with the fixture's public key.

    Returns sign(claims) for tokens made with the fixture's private key, and
    the sample token Laravel's own test signed.
    """

    public_key = fixture_file("test-jwt.pub")
    private_key = fixture_file("test-jwt.key").read_text(encoding="utf-8")
    claims = json.loads(fixture_file("claims.json").read_text(encoding="utf-8"))

    monkeypatch.setattr(config, "JWT_PUBLIC_KEY_PATH", str(public_key))
    monkeypatch.setattr(config, "HOUSEHOLD_ID", "h1")
    monkeypatch.setattr(config, "JWT_ISSUER", "aster")
    monkeypatch.setattr(config, "API_KEY", "admin-key")
    auth._key_cache.clear()

    def sign(**changes):
        body = dict(claims, iat=int(time.time()), exp=int(time.time()) + 3600)
        body.update(changes)
        body = {k: v for k, v in body.items() if v is not None}
        return jwt.encode(body, private_key, algorithm="RS256")

    yield {
        "sign": sign,
        "sample": fixture_file("sample-token.txt").read_text(encoding="utf-8").strip(),
        "claims": claims,
    }

    auth._key_cache.clear()


@pytest.fixture
def markl_db(tmp_path, monkeypatch):
    """Mark-L's fact store in a temporary folder."""

    from markl.memory import store

    store.close()
    monkeypatch.setenv("ZYPHER_MARKL_MEMORY_DB", os.path.join(str(tmp_path), "memory.db"))
    yield tmp_path
    store.close()
