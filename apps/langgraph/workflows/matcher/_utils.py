"""Internal utilities for the matcher workflow.

Currently houses logging helpers that scrub BYOK secrets before they hit
log lines or LangSmith traces. Keep this module dependency-light so it can
be imported from any node without dragging in pandas / lotus / httpx.
"""

from __future__ import annotations

from typing import Any


def redact_lm_config(cfg: dict[str, Any] | None) -> dict[str, Any]:
    """Return a copy of an ``lm_config`` dict with the api_key replaced.

    Used anywhere ``lm_config`` would otherwise be logged. Always copy so
    callers can't accidentally mutate the original side-channel value.
    """
    if not cfg:
        return {}
    out = dict(cfg)
    if out.get("api_key"):
        out["api_key"] = "<redacted>"
    return out
