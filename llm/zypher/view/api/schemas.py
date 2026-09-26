"""Request bodies. Responses are plain dicts in the OpenAI shapes."""

from typing import List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

from markl.memory.store import CATEGORIES
from zypher.model.memory import NOTE_MAX_CHARS

Engine = Literal["local", "markl"]


class TextPart(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: str
    text: Optional[str] = None


class Message(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: Literal["system", "user", "assistant"]
    content: Union[str, List[TextPart]]

    def as_dict(self):
        """{"role", "content"} with multi-part content flattened to its text."""

        content = self.content

        if not isinstance(content, str):
            content = "".join(part.text or "" for part in content if part.type == "text")

        return {"role": self.role, "content": content}


class ChatRequest(BaseModel):
    # Unknown OpenAI fields (n, stop, seed, ...) are accepted and ignored, so
    # an existing client does not have to be trimmed down to talk to this.
    model_config = ConfigDict(extra="ignore")

    # "zephyr-7b" or "mark-l" picks the engine the way an OpenAI client picks
    # a model. Any other name falls through to the server default.
    model: Optional[str] = None
    messages: List[Message] = Field(min_length=1)
    stream: bool = False
    max_tokens: Optional[int] = Field(default=None, ge=1)
    max_completion_tokens: Optional[int] = Field(default=None, ge=1)
    temperature: Optional[float] = Field(default=None, ge=0, le=2)
    top_p: Optional[float] = Field(default=None, gt=0, le=1)

    # Runner extensions.
    #
    # engine wins over model: "local" is Zephyr on this PC, "markl" is Mark-L
    # on Gemini. assistant_name is what Mark-L calls itself for this turn --
    # the name the admin panel gave that engine.
    engine: Optional[Engine] = None
    assistant_name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    web: Union[bool, Literal["auto"]] = "auto"
    memory: Optional[bool] = None
    sampling: Optional[Literal["precise", "balanced", "creative"]] = None
    min_tokens: Optional[int] = Field(default=None, ge=1)


class NoteRequest(BaseModel):
    text: str = Field(min_length=1, max_length=NOTE_MAX_CHARS)

    # Mark-L facts only: where to file it. Without them it is a note, keyed by
    # its first words.
    category: Optional[Literal[CATEGORIES]] = None
    key: Optional[str] = Field(default=None, min_length=1, max_length=60)


class RateRequest(BaseModel):
    rating: Literal["good", "bad"]


class SettingsRequest(BaseModel):
    web: Optional[bool] = None
    memory: Optional[bool] = None
    max_tokens: Optional[int] = Field(default=None, ge=1)

    # The engine a request gets when it does not name one, and Mark-L's
    # Gemini budget: "free" stays inside a free key's quota, "paid" unlocks
    # grounded search and the full model.
    engine: Optional[Engine] = None
    markl_mode: Optional[Literal["free", "paid"]] = None
