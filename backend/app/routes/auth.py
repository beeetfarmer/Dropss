import logging
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
import hmac

from ..anomaly import record_anomaly_event
from ..config import get_settings
from ..rate_limit import rate_limit
from ..security import (
    CSRF_COOKIE_NAME,
    SESSION_COOKIE_NAME,
    create_csrf_token,
    create_session_token,
    csrf_cookie_samesite,
    require_authenticated_request,
)


router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    _: None = Depends(rate_limit(max_requests=10, window_seconds=60)),
):
    settings = get_settings()
    if not settings.auth_enabled:
        return {"authenticated": True, "auth_enabled": False}

    if not settings.app_password:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="APP_PASSWORD is not configured",
        )
    if not settings.app_secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="APP_SECRET_KEY is not configured",
        )

    if not hmac.compare_digest(payload.password, settings.app_password):
        client_ip = request.client.host if request.client else "unknown"
        logger.warning("failed_login_attempt ip=%s", client_ip)
        record_anomaly_event(
            category="auth_failures",
            key=client_ip,
            threshold=5,
            window_seconds=600,
            logger=logger,
            details={"path": "/auth/login"},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_session_token("dropss-user")
    csrf_token = create_csrf_token()
    samesite_mode = csrf_cookie_samesite()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=max(settings.session_ttl_hours, 1) * 3600,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=samesite_mode,
        path="/",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=max(settings.session_ttl_hours, 1) * 3600,
        httponly=False,
        secure=settings.auth_cookie_secure,
        samesite=samesite_mode,
        path="/",
    )
    return {"authenticated": True, "auth_enabled": True}


@router.post("/logout")
async def logout(response: Response):
    settings = get_settings()
    if not settings.auth_enabled:
        return {"authenticated": True, "auth_enabled": False}
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    response.delete_cookie(key=CSRF_COOKIE_NAME, path="/")
    return {"authenticated": False, "auth_enabled": True}


@router.get("/me")
async def me(request: Request):
    settings = get_settings()
    if not settings.auth_enabled:
        return {"authenticated": True, "auth_enabled": False}

    require_authenticated_request(request)
    return {"authenticated": True, "auth_enabled": True}
