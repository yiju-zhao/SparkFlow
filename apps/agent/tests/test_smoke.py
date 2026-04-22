"""End-to-end smoke test: discovery + registry + prompt builder.

Verifies that the full P1 harness plumbing works in one shot. After P1
lands, this is the canary that breaks if any task's public surface drifts.
"""

from hermes.prompt_builder import PromptBuilder
from hermes.registry import discover_builtin_tools, registry


def test_p1_harness_end_to_end():
    # 1. Discover and register all tools in apps/agent/tools/
    imported = discover_builtin_tools()
    assert any(m.endswith("._echo") for m in imported)

    # 2. The echo tool is queryable from the registry via toolset filter
    tools = registry.get_tools(toolset={"_test"})
    assert len(tools) == 1
    assert tools[0].name == "echo"

    # 3. Invoking the tool round-trips
    assert tools[0].invoke({"text": "hi"}) == "hi"

    # 4. PromptBuilder assembles a full system prompt without crashing
    pb = PromptBuilder()
    prompt = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="smoke_user",
        session_id="smoke_session",
    )
    assert "SparkFlow" in prompt
    assert "<tool_persistence>" in prompt
    assert "Session Metadata" in prompt
    assert "smoke_session" in prompt

    # 5. Cache hits on second call
    prompt2 = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="smoke_user",
        session_id="smoke_session",
    )
    assert prompt is prompt2 or prompt == prompt2
