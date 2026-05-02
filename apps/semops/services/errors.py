"""Pickle-safe error types raised across the ProcessPoolExecutor boundary.

When a worker subprocess raises, ``concurrent.futures`` pickles the exception
and re-raises it in the parent process. Provider SDK exceptions (notably
litellm's ``AuthenticationError``) have ``__init__`` signatures that require
positional arguments that are NOT pickled along with the instance — pickling
the exception succeeds, but unpickling crashes the parent and surfaces as
``BrokenProcessPool``, masking the real error.

The fix is to translate every provider exception into one of the small,
pickle-safe types below before it leaves the worker. Each type:

* Subclasses ``Exception`` with a vanilla ``__init__(self, message)``.
* Holds nothing but ``message: str`` so reconstructing the instance via
  ``cls(message)`` is always valid (this is what pickle does on unpickle).
* Has a stable, importable name so the parent process can ``except`` it.

Mapped to HTTP statuses by ``api/routes/rank.py``:

    SemopsAuthError      -> 401  (BYOK key rejected)
    SemopsRateLimitError -> 429  (provider rate limit)
    SemopsBadRequest     -> 400  (malformed candidates / etc.)
    SemopsProviderError  -> 502  (provider 5xx / unknown failure)
"""

from __future__ import annotations


class SemopsError(Exception):
    """Base class for semops errors that cross the pool boundary."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class SemopsAuthError(SemopsError):
    """Provider rejected the BYOK credentials (401-equivalent)."""


class SemopsRateLimitError(SemopsError):
    """Provider rate-limited the request (429-equivalent)."""


class SemopsProviderError(SemopsError):
    """Provider 5xx or otherwise unspecified upstream failure (502-equivalent)."""


class SemopsBadRequest(SemopsError):
    """Malformed request (e.g. bad candidates, empty fields) — caller error (400-equivalent)."""


__all__ = [
    "SemopsError",
    "SemopsAuthError",
    "SemopsRateLimitError",
    "SemopsProviderError",
    "SemopsBadRequest",
]
