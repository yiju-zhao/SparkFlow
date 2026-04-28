"""Pydantic discriminated-union models for POST /v1/workflows/wiki/extract.

Existing notebook state (graph + communities + community pages) is no
longer carried in the HTTP body — the workflow loads it from Postgres
directly via _load_state(notebook_id).
"""

from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator


class BYOKConfig(BaseModel):
    provider: str
    model: str
    apiKey: str
    baseUrl: Optional[str] = None


class _BaseWikiReq(BaseModel):
    notebookId: str
    sourceId: str
    userId: str
    sourceTitle: str
    byok: BYOKConfig
    sourceMap: dict[str, str] = Field(default_factory=dict)


class WikiExtractMode(_BaseWikiReq):
    mode: Literal["extract"] = "extract"
    sourceContent: str = ""
    existingNodeLabels: list[str] = []

    @model_validator(mode="after")
    def _content_required(self):
        if not self.sourceContent:
            raise ValueError("sourceContent required for mode=extract")
        return self


class WikiRemoveMode(_BaseWikiReq):
    mode: Literal["remove"]


WikiExtractRequest = Annotated[
    Union[WikiExtractMode, WikiRemoveMode],
    Field(discriminator="mode"),
]


class WikiExtractError(BaseModel):
    code: Literal["INVALID_KEY", "TIMEOUT", "UPSTREAM_ERROR", "BAD_INPUT", "EXTRACTION_FAILED"]
    providerId: Optional[str] = None
    message: str
