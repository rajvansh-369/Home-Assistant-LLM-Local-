"""caller(): the admin key, or a Laravel-signed llm_token for this household."""

import time

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from zypher import config
from zypher.view.api import auth


def request(token=None):
    headers = [] if token is None else [(b"authorization", "Bearer {}".format(token).encode())]
    return Request({"type": "http", "method": "GET", "path": "/", "headers": headers})


def refused(token):
    with pytest.raises(HTTPException) as caught:
        auth.caller(request(token))

    return caught.value.status_code


def test_admin_key_is_the_admin(jwt_fixture):
    assert auth.caller(request("admin-key")) == auth.ADMIN


def test_sample_token_from_laravel_is_profile_12(jwt_fixture):
    who = auth.caller(request(jwt_fixture["sample"]))

    assert who.scope == "p12"
    assert who.web_allowed and who.memory_allowed
    assert not who.admin


def test_token_limits_come_from_its_claims(jwt_fixture):
    who = auth.caller(request(jwt_fixture["sign"](web="never", memory=False)))

    assert (who.web_allowed, who.memory_allowed) == (False, False)


@pytest.mark.parametrize("changes", [
    {"aud": "h2"},                                   # another household
    {"aud": None},                                   # no audience at all
    {"exp": int(time.time()) - 3600},                # expired
    {"iss": "someone-else"},                         # wrong issuer
    {"scope": None},                                 # no memory scope
    {"scope": "../.."},                              # nothing left after cleaning
])
def test_bad_tokens_get_401(jwt_fixture, changes):
    assert refused(jwt_fixture["sign"](**changes)) == 401


def test_another_household_refuses_the_sample_token(jwt_fixture, monkeypatch):
    monkeypatch.setattr(config, "HOUSEHOLD_ID", "h7")

    assert refused(jwt_fixture["sample"]) == 401


def test_scope_is_cleaned_to_a_folder_name(jwt_fixture):
    assert auth.caller(request(jwt_fixture["sign"](scope="p12/../x"))).scope == "p12x"


def test_no_token_or_a_wrong_key_gets_401(jwt_fixture):
    assert refused(None) == 401
    assert refused("not-the-key") == 401


def test_without_household_id_phone_tokens_are_refused(jwt_fixture, monkeypatch):
    monkeypatch.setattr(config, "HOUSEHOLD_ID", None)

    assert refused(jwt_fixture["sample"]) == 401
    assert auth.caller(request("admin-key")) == auth.ADMIN


def test_open_server_still_scopes_a_valid_token(jwt_fixture, monkeypatch):
    monkeypatch.setattr(config, "API_KEY", None)

    assert auth.caller(request(None)) == auth.ADMIN
    assert auth.caller(request(jwt_fixture["sample"])).scope == "p12"
    assert refused(jwt_fixture["sign"](aud="h2")) == 401


def test_admin_only_refuses_a_profile(jwt_fixture):
    with pytest.raises(HTTPException) as caught:
        auth.admin_only(request(jwt_fixture["sample"]))

    assert caught.value.status_code == 403
    assert auth.admin_only(request("admin-key")) == auth.ADMIN
