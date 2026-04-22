"""Shared pytest fixtures for apps/agent tests.

Injects apps/agent on sys.path so tests can import `hermes`, `tools`, etc.
without an editable install.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
