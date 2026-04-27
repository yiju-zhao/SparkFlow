"""Tests for the ARQ → daily_digest adapter."""

from unittest.mock import AsyncMock

import pytest

from workflows.digest_tasks import arq_generate_section


@pytest.mark.asyncio
async def test_adapter_invokes_entrypoint(monkeypatch):
    fake = AsyncMock(return_value=None)
    monkeypatch.setattr("workflows.digest_tasks.generate_section.ainvoke", fake)
    payload = {
        "section_id": "s", "source_type": "WECHAT", "digest_date": "2026-04-27",
        "queries": [], "subscribed_source_ids": [], "top_n": 5,
        "model_provider": "openai", "model_name": "gpt-4o", "api_key": "k",
    }
    await arq_generate_section({}, payload)
    fake.assert_called_once()
    call_arg = fake.call_args.args[0]
    assert call_arg.section_id == "s"
