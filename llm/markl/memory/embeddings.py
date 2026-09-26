"""
Scoring facts against a query, with or without an API. Ported from Mark-L.

Two backends, same interface:

* Embeddings -- Gemini embed_content, cosine similarity. Understands that
  "what am I building" should surface "side project: a drone controller",
  which no word matching will.
* Lexical -- weighted token overlap, entirely local. Costs nothing, works
  offline, never fails mid-answer.

Lexical is what runs in free mode and during a quota cooldown, so it has to be
good enough on its own. Embeddings are the upgrade, not the baseline. Vectors
are computed once per fact and cached in the embedding column; put_fact nulls
it when a value changes, so a stale vector cannot outlive its text.
"""

import logging
import math
import re
import threading

import numpy as np

from markl import budget, settings

from . import store

log = logging.getLogger("markl.memory.embed")

# Retrieval quality is not worth an API stall in front of every answer.
EMBED_TIMEOUT = 8.0

_lock = threading.Lock()
_failed = False          # set after a hard failure: stop retrying this process


def available():
    if _failed or not budget.allows("embeddings"):
        return False

    return settings.get().is_configured


# -- embedding backend ----------------------------------------

def _client():
    from google import genai

    # http_options.timeout is in milliseconds.
    return genai.Client(
        api_key=settings.get().gemini_api_key,
        http_options={"timeout": int(EMBED_TIMEOUT * 1000)},
    )


def embed(texts):
    """Vectors for texts, or None if the backend is unavailable or failed."""

    global _failed

    if not texts or not available():
        return None

    model = settings.get().embed_model

    try:
        response = _client().models.embed_content(model=model, contents=texts)
        vectors = [np.asarray(e.values, dtype=np.float32) for e in response.embeddings]

        if len(vectors) != len(texts):
            log.warning("expected %d embeddings, got %d", len(texts), len(vectors))
            return None

        return vectors

    except Exception as error:
        budget.report(error)

        # One failure is enough. Retrying per query would put a known-bad
        # round trip in front of every recall.
        with _lock:
            _failed = True

        log.warning("embeddings unavailable, using lexical: %s", error)
        return None


def backfill(limit=64):
    """Embed facts with no current vector. Returns how many were done."""

    if not available():
        return 0

    model = settings.get().embed_model
    rows = store.facts_missing_embeddings(model, limit=limit)

    if not rows:
        return 0

    vectors = embed([_fact_text(r) for r in rows])

    if vectors is None:
        return 0

    for row, vector in zip(rows, vectors):
        store.set_embedding(row["id"], vector.tobytes(), model)

    return len(rows)


def _fact_text(row):
    """What gets embedded -- the key carries meaning the value omits."""

    return "{} {}: {}".format(row["category"], row["key"].replace("_", " "), row["value"])


def _cosine(a, b):
    na, nb = np.linalg.norm(a), np.linalg.norm(b)

    if na == 0 or nb == 0:
        return 0.0

    return float(np.dot(a, b) / (na * nb))


# -- lexical backend ------------------------------------------

_WORD = re.compile(r"[a-z0-9]+")

_STOP = frozenset("""
a an the and or but if then than that this these those of in on at to for from by with
about into over after is are was were be been being am do does did doing have has had
i me my mine you your yours he him his she her it its we us our they them their
what which who whom whose when where why how all any both each few more most other some
such no nor not only own same so too very can will just should now got get
""".split())


def _tokens(text):
    return [w for w in _WORD.findall(text.lower()) if w not in _STOP and len(w) > 1]


# Word matching alone cannot connect "what do I do for work" to a fact stored
# as current_job. These clusters cover the vocabulary people use about what
# this store holds -- the six categories and little else.
_SYNONYMS = (
    frozenset("job work works working career employment profession occupation role company employer".split()),
    frozenset("city home live lives living location place town country address".split()),
    frozenset("food eat eats eating cuisine dish meal dinner lunch breakfast".split()),
    frozenset("family sister brother mother father parent parents sibling siblings wife husband partner girlfriend boyfriend relative son daughter".split()),
    frozenset("friend friends colleague colleagues mate".split()),
    frozenset("project projects building build builds built making make side app".split()),
    frozenset("travel trip visit vacation holiday going abroad".split()),
    frozenset("name called call".split()),
    frozenset("age old birthday born".split()),
    frozenset("study studies school college university degree student education".split()),
    frozenset("hobby hobbies interest interests fun leisure pastime".split()),
    frozenset("want wants wish wishes plan plans goal goals dream dreams".split()),
    frozenset("code coding programming program developer development software engineer".split()),
    frozenset("framework frameworks stack tech technology technologies tool tools library".split()),
    frozenset("music song songs artist band listen".split()),
    frozenset("film films movie movies show shows watch".split()),
    frozenset("game games gaming play playing".split()),
    frozenset("sport sports team play exercise gym fitness".split()),
)

_EXPANSION = {}

for _cluster in _SYNONYMS:
    for _word in _cluster:
        _EXPANSION.setdefault(_word, set()).update(_cluster - {_word})

# A synonym is a weaker signal than a word the user said, so an exact match
# always outranks a synonym match.
_SYNONYM_WEIGHT = 0.5


def _expand(tokens):
    weighted = {t: 1.0 for t in tokens}

    for token in tokens:
        for related in _EXPANSION.get(token, ()):
            weighted.setdefault(related, _SYNONYM_WEIGHT)

    return weighted


def lexical_scores(query, texts):
    """Overlap between query and each text, rarer words counting for more."""

    q_tokens = set(_tokens(query))

    if not q_tokens or not texts:
        return [0.0] * len(texts)

    q = _expand(q_tokens)
    docs = [_tokens(t) for t in texts]
    n = len(docs)

    df = {}

    for doc in docs:
        for word in set(doc):
            df[word] = df.get(word, 0) + 1

    scores = []

    for doc in docs:
        hit = q.keys() & set(doc)

        if not hit:
            scores.append(0.0)
            continue

        weight = sum(q[w] * math.log(1 + n / (1 + df.get(w, 0))) for w in hit)
        # Normalised by what the user asked: a long fact that contains the
        # query terms is still a good answer.
        scores.append(weight / (len(q_tokens) + 1e-9))

    return scores


# -- the one entry point --------------------------------------

def score(query, rows):
    """Relevance of each fact row to query. Never raises.

    Embeddings only when every row has one -- mixing cosine with overlap in
    one ranking would compare two scales and favour whichever ran.
    """

    if not rows:
        return []

    if available():
        try:
            vectors = _vectors_for(rows)
            query_vector = embed([query]) if vectors else None

            if query_vector:
                return [_cosine(query_vector[0], v) for v in vectors]

        except Exception as error:
            log.warning("embedding scoring failed, using lexical: %s", error)

    return lexical_scores(query, [_fact_text(r) for r in rows])


def _vectors_for(rows):
    """Current vectors for every row, or None if any is still missing one."""

    backfill(limit=len(rows))

    model = settings.get().embed_model
    fresh = {r["id"]: r for r in store.facts_by_ids([r["id"] for r in rows])}
    vectors = []

    for row in rows:
        current = fresh.get(row["id"])

        if current is None or not current["embedding"] or current["embed_model"] != model:
            return None

        vectors.append(np.frombuffer(current["embedding"], dtype=np.float32))

    return vectors
