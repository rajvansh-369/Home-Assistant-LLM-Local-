"""The routes apply a phone token's limits and scope; only the admin changes settings."""

import threading

import pytest
from fastapi.testclient import TestClient

from zypher.view.api.app import create_app


class StubMarkL:
    def describe(self):
        return {"status": "ready", "model": "stub"}


class StubAssistant:
    """Records what the routes pass on, answers with a fixed result."""

    error = None

    def __init__(self):
        self.lock = threading.Lock()
        self.markl = StubMarkL()
        self.calls = []

    def status(self, engine=None):
        return "ready"

    def answer(self, messages, **options):
        self.calls.append(("answer", options))
        return {
            "text": "hi",
            "finish_reason": "stop",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            "meta": {"engine": options["engine"], "history_kept": 1},
        }

    def _recorder(name, result):
        def call(self, *args, **kwargs):
            self.calls.append((name, kwargs))
            return result
        return call

    memory_stats = _recorder("memory_stats", {})
    profile = _recorder("profile", [])
    records = _recorder("records", [])
    note = _recorder("note", {"id": 1})
    rate = _recorder("rate", {"id": 1})
    forget = _recorder("forget", 0)
    forget_id = _recorder("forget_id", 1)


@pytest.fixture
def api(jwt_fixture):
    stub = StubAssistant()
    client = TestClient(create_app(assistant=stub, load=False))

    def as_(token):
        return {"Authorization": "Bearer {}".format(token)}

    return stub, client, as_, jwt_fixture


def chat(client, headers, **body):
    body.setdefault("messages", [{"role": "user", "content": "hi"}])
    return client.post("/v1/chat/completions", headers=headers, json=body)


def test_profile_chat_gets_its_scope(api):
    stub, client, as_, jwt = api

    assert chat(client, as_(jwt["sample"])).status_code == 200
    assert stub.calls[-1][1]["scope"] == "p12"


def test_admin_chat_uses_the_global_store(api):
    stub, client, as_, _ = api

    assert chat(client, as_("admin-key")).status_code == 200
    assert stub.calls[-1][1]["scope"] is None


def test_token_turns_off_web_and_memory_whatever_the_request_says(api):
    stub, client, as_, jwt = api

    chat(client, as_(jwt["sign"](web="never", memory=False)), web=True, memory=True)
    options = stub.calls[-1][1]

    assert options["web"] is False
    assert options["memory"] is False


def test_request_can_still_turn_them_off_itself(api):
    stub, client, as_, jwt = api

    chat(client, as_(jwt["sample"]), web=False, memory=False)
    options = stub.calls[-1][1]

    assert (options["web"], options["memory"]) == (False, False)


def test_settings_change_is_admin_only(api):
    _, client, as_, jwt = api

    assert client.patch("/v1/settings", headers=as_(jwt["sample"]), json={"web": True}).status_code == 403
    assert client.patch("/v1/settings", headers=as_("admin-key"), json={"web": True}).status_code == 200
    assert client.get("/v1/settings", headers=as_(jwt["sample"])).status_code == 200


def test_memory_calls_are_scoped_to_the_profile(api):
    stub, client, as_, jwt = api
    headers = as_(jwt["sample"])

    client.get("/v1/memory", headers=headers)
    client.get("/v1/memory/records", headers=headers)
    client.post("/v1/memory/notes", headers=headers, json={"text": "likes tea"})
    client.delete("/v1/memory", headers=headers, params={"selector": "last"})
    client.delete("/v1/memory/3", headers=headers)

    scopes = {name: kwargs.get("scope") for name, kwargs in stub.calls}
    assert set(scopes.values()) == {"p12"}
    assert "forget_id" in scopes


def test_memory_is_403_when_the_token_turns_it_off(api):
    _, client, as_, jwt = api
    guest = as_(jwt["sign"](memory=False))

    assert client.get("/v1/memory", headers=guest).status_code == 403
    assert client.delete("/v1/memory/1", headers=guest).status_code == 403


def test_bad_token_is_401_and_health_needs_none(api):
    _, client, as_, jwt = api

    assert chat(client, as_(jwt["sign"](aud="h2"))).status_code == 401

    health = client.get("/health").json()
    assert health["busy"] is False
