"""Each profile keeps its own memory, on both engines."""

import os

from markl import memory as markl_memory
from markl import registry
from markl.memory import store
from zypher.model import memory as memory_store


# -- local engine ----------------------------------------------

def hashing_store(directory):
    return memory_store.Memory(directory=str(directory), embedder=memory_store._HashingEmbedder())


def test_profile_stores_share_the_encoder_and_keep_apart(tmp_path):
    root = hashing_store(tmp_path)
    assert root.ready(10)

    p12 = memory_store.Memory(directory=str(tmp_path / "p12"), embedder=root.embedder)
    assert p12.ready(10)
    assert p12.embedder is root.embedder

    p12.note("I use four spaces in Python")

    assert [r["a"] for r in p12.records] == ["I use four spaces in Python"]
    assert root.records == []
    assert os.path.exists(tmp_path / "p12" / "memory.jsonl")


def test_forget_id_drops_one_record_only(tmp_path):
    store_ = hashing_store(tmp_path)
    assert store_.ready(10)

    first = store_.note("likes tea")
    store_.note("likes green tea")

    assert store_.forget_id(first["id"]) == 1
    assert [r["a"] for r in store_.records] == ["likes green tea"]
    assert len(store_.vectors) == 1
    assert store_.forget_id(first["id"]) == 0


# -- Mark-L -------------------------------------------------------

def test_markl_facts_stay_in_their_profile(markl_db):
    with store.use_scope("p12"):
        markl_memory.update("preferences", "drink", "tea")

    with store.use_scope("p13"):
        assert markl_memory.records() == []

    assert markl_memory.records() == []  # the admin's store

    with store.use_scope("p12"):
        assert [r["a"] for r in markl_memory.records()] == ["tea"]

    assert os.path.exists(markl_db / "p12" / "memory.db")


def test_markl_tools_on_pool_threads_write_to_the_callers_profile(markl_db):
    with store.use_scope("p12"):
        registry.run("save_memory", {"category": "identity", "key": "name", "value": "Asha"})

    with store.use_scope("p12"):
        assert markl_memory.profile() == ["name: Asha"]

    assert markl_memory.profile() == []
