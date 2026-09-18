"""Short-lived in-process cache for expensive live upstream responses."""
from __future__ import annotations

import threading
import time
from typing import Any, Callable, Optional

_lock = threading.Lock()
_store: dict[str, tuple[float, Any]] = {}


def cache_get(key: str) -> Optional[Any]:
    now = time.monotonic()
    with _lock:
        item = _store.get(key)
        if not item:
            return None
        expires_at, value = item
        if expires_at < now:
            _store.pop(key, None)
            return None
        return value


def cache_set(key: str, value: Any, ttl_seconds: float = 20.0) -> None:
    with _lock:
        _store[key] = (time.monotonic() + max(0.5, float(ttl_seconds)), value)


def cache_get_or_set(key: str, factory: Callable[[], Any], ttl_seconds: float = 20.0) -> Any:
    hit = cache_get(key)
    if hit is not None:
        return hit
    value = factory()
    if value is not None:
        cache_set(key, value, ttl_seconds=ttl_seconds)
    return value
