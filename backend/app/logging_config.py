import json
import logging
import re
from datetime import datetime, timezone


KEY_VALUE_PATTERN = re.compile(
    r'(?i)("?(?:password|secret|token|api[_-]?key|app_password|app_secret_key|cookie|set-cookie)"?\s*[:=]\s*)(?:"[^"]*"|[^,\s]+)'
)
BEARER_PATTERN = re.compile(r"(?i)(authorization:\s*bearer\s+)([a-z0-9._\-]+)")
API_KEY_PATTERN = re.compile(r"\bdrps_[A-Za-z0-9]+\.[A-Za-z0-9._\-]+\b")
QUERY_SECRET_PATTERN = re.compile(r"(?i)((?:token|api[_-]?key|password|secret)=)([^&\s]+)")
NOISY_LOGGERS = (
    "app.scheduler",
    "app.services.plex_service",
    "app.services.jellyfin_service",
    "app.services.navidrome_service",
)


def redact_text(value: str) -> str:
    if not value:
        return value
    redacted = KEY_VALUE_PATTERN.sub(r"\1***", value)
    redacted = BEARER_PATTERN.sub(r"\1***", redacted)
    redacted = QUERY_SECRET_PATTERN.sub(r"\1***", redacted)
    redacted = API_KEY_PATTERN.sub("***", redacted)
    return redacted


class RedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            return True
        record.msg = redact_text(message)
        record.args = ()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_text(record.getMessage()),
        }
        if record.exc_info:
            payload["exception"] = redact_text(self.formatException(record.exc_info))
        return json.dumps(payload, ensure_ascii=True)


def setup_logging(level: str = "INFO", app_env: str = "development"):
    env = app_env.lower().strip()
    configured_level = level.upper().strip()
    if env == "production" and configured_level in {"DEBUG", "INFO"}:
        configured_level = "WARNING"

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, configured_level, logging.INFO))
    if not root_logger.handlers:
        root_logger.addHandler(logging.StreamHandler())

    for handler in root_logger.handlers:
        handler.setFormatter(JsonFormatter())
        handler.addFilter(RedactionFilter())

    if env == "production":
        for logger_name in NOISY_LOGGERS:
            logging.getLogger(logger_name).setLevel(logging.WARNING)
