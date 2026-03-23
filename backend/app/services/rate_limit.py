import threading
import time
from collections import deque
from fastapi import HTTPException, status

class RateLimiter:
    def __init__(self):
        self._lock = threading.Lock()
        self._buckets: dict[str, deque[float]] = {}
        self._last_cleanup = time.time()

    def enforce(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.time()
        cutoff = now - window_seconds

        with self._lock:
            # 1. Periodic cleanup of stale keys to prevent memory leak
            if now - self._last_cleanup > 60:  # Every 60 seconds
                self._cleanup_all_buckets(now)

            # 2. Process current bucket
            bucket = self._buckets.setdefault(key, deque())
            while bucket and bucket[0] < cutoff:
                bucket.popleft()

            if len(bucket) >= limit:
                # bucket[0] is the oldest request in the current window
                wait_time = int(window_seconds - (now - bucket[0]))
                retry_after = max(1, wait_time)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Try again in {retry_after} seconds.",
                    headers={"Retry-After": str(retry_after)},
                )

            bucket.append(now)

    def _cleanup_all_buckets(self, now: float):
        """Remove keys that have had no activity for over an hour."""
        stale_cutoff = now - 3600 
        to_remove = [k for k, b in self._buckets.items() if not b or b[-1] < stale_cutoff]
        for k in to_remove:
            del self._buckets[k]
        self._last_cleanup = now

# Global instance
limiter = RateLimiter()

def enforce_rate_limit(*, key: str, limit: int, window_seconds: int):
    limiter.enforce(key, limit, window_seconds)