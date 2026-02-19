import base64
import hashlib
import hmac
import ipaddress
import logging
import secrets
import socket
import time
from datetime import datetime
from urllib.parse import urlparse

from fastapi import HTTPException, Request, status

from .anomaly import record_anomaly_event
from .config import get_settings
from .database import SessionLocal
from .models import ApiKey


SESSION_COOKIE_NAME = "dropss_session"
CSRF_COOKIE_NAME = "dropss_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"
API_KEY_HEADER_NAME = "X-API-Key"
API_KEY_TOKEN_PREFIX = "drps_"
API_KEY_SCOPES = ("read", "write", "admin")
API_KEY_SCOPES_SET = set(API_KEY_SCOPES)
METADATA_BLOCKLIST = {
    ipaddress.ip_address("169.254.169.254"),
    ipaddress.ip_address("100.100.100.200"),
}
logger = logging.getLogger(__name__)


def _require_secret_key() -> str:
    settings = get_settings()
    if not settings.app_secret_key:
        raise RuntimeError("APP_SECRET_KEY is required")
    return settings.app_secret_key


def create_session_token(subject: str = "dropss") -> str:
    secret = _require_secret_key()
    issued_at = str(int(time.time()))
    payload = f"{subject}:{issued_at}"
    signature = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    raw = f"{payload}:{signature}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def verify_session_token(token: str) -> bool:
    settings = get_settings()
    ttl_seconds = max(settings.session_ttl_hours, 1) * 3600
    try:
        secret = _require_secret_key()
    except RuntimeError:
        return False

    try:
        padded = token + "=" * (-len(token) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        subject, issued_at, provided_sig = decoded.rsplit(":", 2)
        if not subject:
            return False
        payload = f"{subject}:{issued_at}"
        expected_sig = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(provided_sig, expected_sig):
            return False
        age = int(time.time()) - int(issued_at)
        return age >= 0 and age <= ttl_seconds
    except Exception:
        return False


def _normalize_api_key_scopes(scopes: set[str] | list[str] | tuple[str, ...]) -> set[str]:
    normalized = {scope.strip().lower() for scope in scopes if scope and scope.strip()}
    invalid = normalized - API_KEY_SCOPES_SET
    if invalid:
        raise ValueError(f"Invalid scope(s): {', '.join(sorted(invalid))}")
    return normalized or {"read"}


def serialize_api_key_scopes(scopes: set[str] | list[str] | tuple[str, ...]) -> str:
    normalized = _normalize_api_key_scopes(set(scopes))
    ordered = [scope for scope in API_KEY_SCOPES if scope in normalized]
    return ",".join(ordered)


def parse_api_key_scopes(scopes: str) -> set[str]:
    if not scopes:
        return {"read"}
    return _normalize_api_key_scopes(set(scopes.split(",")))


def generate_api_key_token() -> tuple[str, str, str]:
    key_id = secrets.token_hex(8)
    token_secret = secrets.token_urlsafe(32)
    raw_key = f"{API_KEY_TOKEN_PREFIX}{key_id}.{token_secret}"
    key_prefix = raw_key[:16]
    return raw_key, key_id, key_prefix


def hash_api_key_token(raw_key: str) -> str:
    secret = _require_secret_key()
    return hmac.new(secret.encode("utf-8"), raw_key.encode("utf-8"), hashlib.sha256).hexdigest()


def _extract_api_key_from_request(request: Request) -> str:
    auth_header = request.headers.get("authorization", "").strip()
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            return token
    return request.headers.get(API_KEY_HEADER_NAME, "").strip()


def _parse_api_key(raw_key: str) -> tuple[str, str] | None:
    if not raw_key.startswith(API_KEY_TOKEN_PREFIX):
        return None
    body = raw_key[len(API_KEY_TOKEN_PREFIX):]
    key_id, separator, token_secret = body.partition(".")
    if not separator or not key_id or not token_secret:
        return None
    return key_id, token_secret


def _is_scope_allowed(granted_scopes: set[str], required_scope: str) -> bool:
    if required_scope == "read":
        return bool(granted_scopes & {"read", "write", "admin"})
    if required_scope == "write":
        return bool(granted_scopes & {"write", "admin"})
    if required_scope == "admin":
        return "admin" in granted_scopes
    return False


def _session_auth_context() -> dict:
    return {
        "auth_type": "session",
        "scopes": {"read", "write", "admin"},
        "api_key_id": None,
    }


def _authenticate_api_key(raw_key: str, touch_last_used: bool = True) -> dict | None:
    parsed = _parse_api_key(raw_key)
    if not parsed:
        return None
    key_id, _ = parsed

    try:
        expected_hash = hash_api_key_token(raw_key)
    except RuntimeError:
        return None

    with SessionLocal() as db:
        api_key = db.query(ApiKey).filter(ApiKey.key_id == key_id).first()
        if not api_key:
            return None
        if api_key.revoked_at is not None:
            return None
        now = datetime.utcnow()
        if api_key.expires_at is not None and api_key.expires_at <= now:
            return None
        if not hmac.compare_digest(api_key.key_hash, expected_hash):
            return None
        if touch_last_used:
            api_key.last_used_at = now
            db.commit()

        return {
            "auth_type": "api_key",
            "scopes": parse_api_key_scopes(api_key.scopes),
            "api_key_id": api_key.key_id,
        }


def _resolve_auth_context(request: Request) -> dict:
    existing = getattr(request.state, "auth_context", None)
    if existing:
        return existing

    settings = get_settings()
    if not settings.auth_enabled:
        context = {
            "auth_type": "disabled",
            "scopes": {"read", "write", "admin"},
            "api_key_id": None,
        }
        request.state.auth_context = context
        return context

    if not settings.app_password or not settings.app_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication is not configured",
        )

    raw_api_key = _extract_api_key_from_request(request)
    if raw_api_key:
        context = _authenticate_api_key(raw_api_key, touch_last_used=True)
        if not context:
            client_ip = request.client.host if request.client else "unknown"
            record_anomaly_event(
                category="invalid_api_key",
                key=client_ip,
                threshold=5,
                window_seconds=600,
                logger=logger,
                details={"path": request.url.path},
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API key",
            )
        request.state.auth_context = context
        return context

    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    if not token or not verify_session_token(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    context = _session_auth_context()
    request.state.auth_context = context
    return context


def _require_scope(request: Request, required_scope: str):
    context = _resolve_auth_context(request)
    if not _is_scope_allowed(context["scopes"], required_scope):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{required_scope} scope is required",
        )


def require_authenticated_request(request: Request):
    _require_scope(request, "read")


def require_write_request(request: Request):
    _require_scope(request, "write")


def require_admin_request(request: Request):
    _require_scope(request, "admin")


def get_rate_limit_identity(request: Request) -> str:
    context = getattr(request.state, "auth_context", None)
    if context:
        if context.get("auth_type") == "api_key":
            api_key_id = context.get("api_key_id", "")
            if api_key_id:
                return f"api_key:{api_key_id}"
        if context.get("auth_type") in {"session", "disabled"}:
            return "session:user"
    return request.client.host if request.client else "unknown"


def create_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def csrf_cookie_samesite() -> str:
    settings = get_settings()
    return "strict" if settings.auth_cookie_secure else "lax"


def _allowed_origins() -> set[str]:
    settings = get_settings()
    return {origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()}


def verify_csrf_request(request: Request):
    settings = get_settings()
    if not settings.auth_enabled:
        return

    raw_api_key = _extract_api_key_from_request(request)
    if raw_api_key:
        context = _authenticate_api_key(raw_api_key, touch_last_used=True)
        if context:
            request.state.auth_context = context
            return

    origin = request.headers.get("origin", "").strip()
    if not origin or origin not in _allowed_origins():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Blocked request origin",
        )

    cookie_token = request.cookies.get(CSRF_COOKIE_NAME, "")
    header_token = request.headers.get(CSRF_HEADER_NAME, "")
    if not cookie_token or not header_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Missing CSRF token",
        )
    if not hmac.compare_digest(cookie_token, header_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid CSRF token",
        )


def _allowed_hosts() -> set[str]:
    allowlist = get_settings().outbound_allowlist
    return {host.strip().lower() for host in allowlist.split(",") if host.strip()}


def _host_is_allowlisted(hostname: str) -> bool:
    hostname = hostname.lower()
    allowed = _allowed_hosts()
    if not allowed:
        return False
    return any(hostname == entry or hostname.endswith(f".{entry}") for entry in allowed)


def _resolve_host_ips(hostname: str) -> set[ipaddress._BaseAddress]:
    ips: set[ipaddress._BaseAddress] = set()
    try:
        ips.add(ipaddress.ip_address(hostname))
        return ips
    except ValueError:
        pass

    infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    for info in infos:
        candidate = info[4][0]
        ips.add(ipaddress.ip_address(candidate))
    return ips


def _is_blocked_ip(addr: ipaddress._BaseAddress, hostname_allowlisted: bool) -> bool:
    if addr in METADATA_BLOCKLIST:
        return True
    if not addr.is_global and not hostname_allowlisted:
        return True
    return False


def validate_outbound_url(url: str, field_name: str = "url"):
    if not url:
        return

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(f"{field_name} must use http or https")
    if not parsed.hostname:
        raise ValueError(f"{field_name} must include a hostname")

    hostname_allowlisted = _host_is_allowlisted(parsed.hostname)

    try:
        resolved = _resolve_host_ips(parsed.hostname)
    except Exception:
        raise ValueError(f"{field_name} hostname could not be resolved")

    if not resolved:
        raise ValueError(f"{field_name} hostname resolved to no address")

    for addr in resolved:
        if _is_blocked_ip(addr, hostname_allowlisted):
            raise ValueError(
                f"{field_name} targets a blocked/private address; add hostname to OUTBOUND_ALLOWLIST if trusted"
            )

    if parsed.scheme == "http" and not hostname_allowlisted:
        raise ValueError(f"{field_name} must use https unless hostname is in OUTBOUND_ALLOWLIST")
