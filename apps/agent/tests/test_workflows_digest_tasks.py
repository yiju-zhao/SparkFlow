"""Tests for the ARQ task adapter."""

from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_arq_generate_section_deserializes_payload_and_calls_workflow(monkeypatch):
    """The ARQ task must convert the dict payload back into GenerateSectionRequest
    and invoke the existing generate_section() business logic unchanged."""
    from workflows import daily_digest

    captured: dict = {}

    async def fake_generate_section(req):
        captured["req"] = req
        return {"status": "ok", "items_count": 3}

    monkeypatch.setattr(daily_digest, "generate_section", fake_generate_section)

    from workflows.digest_tasks import arq_generate_section

    payload = {
        "section_id": "sec-123",
        "source_type": "WECHAT",
        "digest_date": "2026-04-23",
        "queries": [{"id": "q1", "text": "ai trends", "enabled": True}, {"id": "q2", "text": "llm benchmarks", "enabled": True}],
        "subscribed_source_ids": [1, 2, 3],
        "top_n": 10,
        "model_provider": "openai",
        "model_name": "gpt-4o-mini",
        "api_key": "sk-test",
        "api_base": None,
    }

    # ARQ passes `ctx` as first positional arg.
    result = await arq_generate_section({}, payload)

    assert result == {"status": "ok", "items_count": 3}
    req = captured["req"]
    assert req.section_id == "sec-123"
    assert req.source_type == "WECHAT"
    assert req.queries == [{"id": "q1", "text": "ai trends", "enabled": True}, {"id": "q2", "text": "llm benchmarks", "enabled": True}]
    assert req.api_key == "sk-test"


@pytest.mark.asyncio
async def test_arq_generate_section_propagates_exceptions(monkeypatch):
    """A failure inside generate_section must bubble up so ARQ can retry / mark failed."""
    from workflows import daily_digest

    async def boom(req):  # noqa: ARG001
        raise RuntimeError("section generation failed")

    monkeypatch.setattr(daily_digest, "generate_section", boom)

    from workflows.digest_tasks import arq_generate_section

    payload = {
        "section_id": "sec-err",
        "source_type": "WECHAT",
        "digest_date": "2026-04-23",
        "queries": [{"id": "q1", "text": "q", "enabled": True}],
        "subscribed_source_ids": [],
        "top_n": 5,
        "model_provider": "openai",
        "model_name": "gpt-4o-mini",
        "api_key": "sk",
        "api_base": None,
    }

    with pytest.raises(RuntimeError, match="section generation failed"):
        await arq_generate_section({}, payload)
