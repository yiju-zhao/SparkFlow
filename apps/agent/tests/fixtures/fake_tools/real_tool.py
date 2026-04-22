"""A fake tool module that registers itself. Used by tests only."""

from hermes.registry import registry

registry.register(name="fake_real", toolset="fake", tool=object())
