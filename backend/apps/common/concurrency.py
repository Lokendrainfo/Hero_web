"""
Shared concurrent HTTP helpers for live FiberForce / iLync fan-out.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Iterable, List, Optional, TypeVar

T = TypeVar("T")
R = TypeVar("R")

# Cap worker count so we stay kind to upstream APIs under bursty Flutter traffic.
DEFAULT_MAX_WORKERS = 16


def map_concurrent(
    items: Iterable[T],
    fn: Callable[[T], R],
    *,
    max_workers: int = DEFAULT_MAX_WORKERS,
) -> List[R]:
    """Run fn over items in a thread pool; preserves input order."""
    seq = list(items)
    if not seq:
        return []
    if len(seq) == 1:
        return [fn(seq[0])]
    workers = max(1, min(int(max_workers), len(seq)))
    results: List[Optional[R]] = [None] * len(seq)
    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_map = {executor.submit(fn, item): idx for idx, item in enumerate(seq)}
        for future in as_completed(future_map):
            idx = future_map[future]
            results[idx] = future.result()
    return [r for r in results]  # type: ignore[misc]


def run_concurrent(callables: Iterable[Callable[[], R]], *, max_workers: int = 8) -> List[R]:
    """Run zero-arg callables concurrently; preserves order."""
    seq = list(callables)
    if not seq:
        return []
    if len(seq) == 1:
        return [seq[0]()]
    workers = max(1, min(int(max_workers), len(seq)))
    results: List[Optional[R]] = [None] * len(seq)
    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_map = {executor.submit(fn): idx for idx, fn in enumerate(seq)}
        for future in as_completed(future_map):
            idx = future_map[future]
            results[idx] = future.result()
    return [r for r in results]  # type: ignore[misc]
