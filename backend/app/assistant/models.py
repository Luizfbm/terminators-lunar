"""The request body of POST /assistant, as the contract draws it."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator
from pydantic_core import PydanticCustomError

from ..constants import DEFAULT_DURATION_HOURS, DEFAULT_OBSERVER_HEIGHT_M


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000, strict=True)


class AssistantQuery(BaseModel):
    site_id: str | None = Field(None, strict=True)
    latitude_deg: float | None = Field(None, ge=-90, le=90, strict=True)
    longitude_deg: float | None = Field(None, ge=-180, le=180, strict=True)
    start: datetime
    duration_hours: float = Field(DEFAULT_DURATION_HOURS, gt=0, le=1440, strict=True)
    observer_height_m: float = Field(DEFAULT_OBSERVER_HEIGHT_M, ge=0, le=50, strict=True)

    @field_validator("start", mode="before")
    @classmethod
    def _start_is_text(cls, value: Any) -> Any:
        # Lax datetimes also take numbers as Unix time; the contract says a date-time string.
        if not isinstance(value, str):
            raise PydanticCustomError("datetime_type", "start must be a date-time string")
        return value


class AssistantRequest(BaseModel):
    messages: list[AssistantMessage] = Field(min_length=1, max_length=20)
    lang: Literal["en", "pt"]
    query: AssistantQuery | None = None

    @field_validator("query", mode="before")
    @classmethod
    def _query_is_not_null(cls, value: Any) -> Any:
        # The contract lets the Query be left out, never be null.
        if value is None:
            raise PydanticCustomError("model_type", "query must be an object")
        return value
