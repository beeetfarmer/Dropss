import logging
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from .anomaly import record_anomaly_event
from .security import get_rate_limit_identity


_REQUEST_LOG: dict[str, deque[float]] = defaultdict(deque)
logger = logging.getLogger(__name__)


def rate_limit(max_requests: int, window_seconds: int):
    def _dependency(request: Request):
        identity = get_rate_limit_identity(request)
        key = f"{identity}:{request.url.path}"
        now = time.time()
        window_start = now - window_seconds
        entries = _REQUEST_LOG[key]

        while entries and entries[0] < window_start:
            entries.popleft()

        if len(entries) >= max_requests:
            logger.warning(
                "rate_limit_exceeded identity=%s path=%s max_requests=%d window_seconds=%d",
                identity,
                request.url.path,
                max_requests,
                window_seconds,
            )
            record_anomaly_event(
                category="rate_limit_exceeded",
                key=f"{identity}:{request.url.path}",
                threshold=3,
                window_seconds=300,
                logger=logger,
                details={"identity": identity, "path": request.url.path},
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Try again later.",
            )

        entries.append(now)

    return _dependency
