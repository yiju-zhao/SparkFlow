"""A helper module that does NOT register at module top level. Should be
skipped by discover_builtin_tools' AST filter.
"""

from hermes.registry import registry


def inner_register_helper():
    """The registry.register call here is INSIDE a function body, so the
    module-top-level AST check will ignore this file."""

    registry.register(name="fake_helper", toolset="fake", tool=object())
