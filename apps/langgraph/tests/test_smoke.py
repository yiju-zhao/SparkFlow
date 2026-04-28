"""Smoke test: every agent module imports cleanly and exposes a compiled `agent`."""


def test_agents_import():
    from agents import deep_research, hub, notebook

    for mod in (notebook, hub, deep_research):
        assert hasattr(mod, "agent"), f"{mod.__name__} must export `agent`"
        assert hasattr(mod.agent, "invoke")
