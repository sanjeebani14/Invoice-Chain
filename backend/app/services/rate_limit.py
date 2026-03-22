import threading
import time
from collections import deque
from fastapi import HTTPException


_LOCK = threading.Lock()
_BUCKETS: dict[str, deque[float]] = {}


def enforce_rate_limit(*, key: str, limit: int, window_seconds: int) -> None:
    now = time.time()
    cutoff = now - window_seconds

    with _LOCK:
        bucket = _BUCKETS.setdefault(key, deque())
        while bucket and bucket[0] < cutoff:
            bucket.popleft()

        if len(bucket) >= limit:
            retry_after = max(1, int(window_seconds - (now - bucket[0])))
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

        bucket.append(now)
