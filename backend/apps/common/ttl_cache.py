"""Tiny process-local TTL cache for expensive dashboard/tracking responses."""
import time
from threading import Lock

_lock = Lock()
_store = {}


def ttl_get(key):
    now = time.time()
    with _lock:
        item = _store.get(key)
        if not item:
            return None
        value, expires_at = item
        if now >= expires_at:
            _store.pop(key, None)
            return None
        return value


def ttl_get_soft(key, soft_ttl_seconds=20, hard_ttl_seconds=120):
    """
    Return (value, is_fresh).
    - fresh: age < soft_ttl
    - stale: soft_ttl <= age < hard_ttl (caller may serve stale + refresh)
    - miss: None, False
    """
    now = time.time()
    with _lock:
        item = _store.get(key)
        if not item:
            return None, False
        value, expires_at = item
        # expires_at is hard expiry; soft is derived from hard - (hard-soft)
        hard = max(1, int(hard_ttl_seconds))
        soft = max(1, int(soft_ttl_seconds))
        created_at = expires_at - hard
        age = now - created_at
        if age >= hard:
            _store.pop(key, None)
            return None, False
        return value, age < soft


def ttl_set(key, value, ttl_seconds=20):
    with _lock:
        _store[key] = (value, time.time() + max(1, int(ttl_seconds)))


def ttl_delete(key):
    with _lock:
        _store.pop(key, None)

