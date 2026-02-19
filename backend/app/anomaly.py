import logging
import time
from collections import defaultdict, deque
from typing import Mapping


_EVENT_LOG: dict[str, deque[float]] = defaultdict(deque)


def record_anomaly_event(
    *,
    category: str,
    key: str,
    threshold: int,
    window_seconds: int,
    logger: logging.Logger,
    details: Mapping[str, str] | None = None,
) -> bool:
    """
    Track repeated suspicious events and emit an alert when threshold is reached.
    Returns True if an alert was emitted for the current event.
    """
    event_key = f"{category}:{key}"
    now = time.time()
    window_start = now - window_seconds
    entries = _EVENT_LOG[event_key]

    while entries and entries[0] < window_start:
        entries.popleft()

    entries.append(now)
    count = len(entries)

    if count < threshold:
        return False

    payload = {
        "category": category,
        "key": key,
        "count": str(count),
        "window_seconds": str(window_seconds),
    }
    if details:
        for detail_key, detail_value in details.items():
            payload[str(detail_key)] = str(detail_value)

    context = " ".join(f"{k}={v}" for k, v in payload.items())
    logger.warning("anomaly_alert %s", context)
    return True
