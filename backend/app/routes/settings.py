from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import SECRET_FIELDS, get_settings as get_app_settings
from ..database import get_db
from ..models import ApiKey
from ..rate_limit import rate_limit
from ..settings_store import load_overrides, save_overrides
from ..security import (
    generate_api_key_token,
    hash_api_key_token,
    parse_api_key_scopes,
    require_admin_request,
    serialize_api_key_scopes,
    validate_outbound_url,
)

router = APIRouter(
    prefix="/settings",
    tags=["settings"],
    dependencies=[Depends(require_admin_request)],
)


class SettingsUpdate(BaseModel):
    spotify_client_id: Optional[str] = None
    spotify_client_secret: Optional[str] = None
    gotify_url: Optional[str] = None
    gotify_token: Optional[str] = None
    ntfy_url: Optional[str] = None
    ntfy_topic: Optional[str] = None
    ntfy_username: Optional[str] = None
    ntfy_password: Optional[str] = None
    lastfm_api_key: Optional[str] = None
    lastfm_username: Optional[str] = None
    jellyfin_url: Optional[str] = None
    jellyfin_api_key: Optional[str] = None
    plex_url: Optional[str] = None
    plex_token: Optional[str] = None
    navidrome_url: Optional[str] = None
    navidrome_username: Optional[str] = None
    navidrome_password: Optional[str] = None
    release_check_time: Optional[str] = None
    timezone: Optional[str] = None
    release_months_back: Optional[int] = None


class ApiKeyCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    scopes: list[str] = Field(default_factory=lambda: ["read"])
    expires_in_days: Optional[int] = Field(default=None, ge=1, le=3650)


def _mask_secret(value: str) -> str:
    if not value or len(value) <= 8:
        return "****" if value else ""
    return f"{value[:4]}{'*' * (len(value) - 8)}{value[-4:]}"


APP_DEFAULTS = {
    "release_check_time": "09:00",
    "timezone": "UTC",
    "release_months_back": 3,
}


def _serialize_api_key(api_key: ApiKey) -> dict:
    now = datetime.utcnow()
    is_active = api_key.revoked_at is None and (api_key.expires_at is None or api_key.expires_at > now)
    return {
        "key_id": api_key.key_id,
        "name": api_key.name,
        "key_prefix": api_key.key_prefix,
        "scopes": sorted(parse_api_key_scopes(api_key.scopes)),
        "created_at": api_key.created_at,
        "last_used_at": api_key.last_used_at,
        "expires_at": api_key.expires_at,
        "revoked_at": api_key.revoked_at,
        "is_active": is_active,
    }


@router.get("/")
async def get_settings_endpoint(_: None = Depends(rate_limit(max_requests=60, window_seconds=60))):
    overrides = load_overrides()
    settings = get_app_settings()

    fields = [
        "spotify_client_id", "spotify_client_secret",
        "gotify_url", "gotify_token",
        "ntfy_url", "ntfy_topic", "ntfy_username", "ntfy_password",
        "lastfm_api_key", "lastfm_username",
        "jellyfin_url", "jellyfin_api_key",
        "plex_url", "plex_token",
        "navidrome_url", "navidrome_username", "navidrome_password",
        "release_check_time", "timezone", "release_months_back",
    ]

    result = {}
    for field in fields:
        if field in SECRET_FIELDS:
            value = getattr(settings, field, APP_DEFAULTS.get(field, ""))
        else:
            value = overrides.get(field, getattr(settings, field, APP_DEFAULTS.get(field, "")))

        if field in SECRET_FIELDS and isinstance(value, str) and value:
            result[field] = _mask_secret(value)
        else:
            result[field] = value

    return result


@router.put("/")
async def update_settings(
    update: SettingsUpdate,
    _: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
):
    overrides = load_overrides()
    for field in SECRET_FIELDS:
        overrides.pop(field, None)

    update_dict = update.model_dump(exclude_none=True)
    disallowed_secret_updates = [key for key in update_dict if key in SECRET_FIELDS]
    if disallowed_secret_updates:
        raise HTTPException(
            status_code=400,
            detail=(
                "Secret fields must be configured via environment variables "
                f"(blocked: {', '.join(disallowed_secret_updates)})"
            ),
        )

    url_fields = {"gotify_url", "ntfy_url", "jellyfin_url", "plex_url", "navidrome_url"}
    for key, value in update_dict.items():
        if key in url_fields and value:
            try:
                validate_outbound_url(value, key)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
        if value == "" and key in overrides:
            del overrides[key]
        elif value != "":
            overrides[key] = value

    save_overrides(overrides)

    get_app_settings.cache_clear()

    schedule_fields = {"release_check_time", "timezone"}
    if schedule_fields & set(update_dict.keys()):
        from ..scheduler import start_scheduler
        start_scheduler()

    return {"message": "Settings updated", "updated_fields": list(update_dict.keys())}


@router.get("/api-keys")
async def list_api_keys(
    limit: int = Query(100, ge=1, le=500, description="Max API keys to return"),
    offset: int = Query(0, ge=0, description="Records to skip"),
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit(max_requests=60, window_seconds=60)),
):
    api_keys = db.query(ApiKey).order_by(ApiKey.created_at.desc()).offset(offset).limit(limit).all()
    return {"items": [_serialize_api_key(api_key) for api_key in api_keys]}


@router.post("/api-keys")
async def create_api_key(
    payload: ApiKeyCreateRequest,
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="API key name is required")

    try:
        scopes_csv = serialize_api_key_scopes(set(payload.scopes))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    expires_at = None
    if payload.expires_in_days is not None:
        expires_at = datetime.utcnow() + timedelta(days=payload.expires_in_days)

    created_api_key: ApiKey | None = None
    raw_key = ""
    for _ in range(3):
        raw_key, key_id, key_prefix = generate_api_key_token()
        try:
            key_hash = hash_api_key_token(raw_key)
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc))
        api_key = ApiKey(
            name=name,
            key_id=key_id,
            key_prefix=key_prefix,
            key_hash=key_hash,
            scopes=scopes_csv,
            expires_at=expires_at,
        )
        db.add(api_key)
        try:
            db.commit()
            db.refresh(api_key)
            created_api_key = api_key
            break
        except IntegrityError:
            db.rollback()

    if created_api_key is None:
        raise HTTPException(status_code=500, detail="Failed to create API key")

    response = _serialize_api_key(created_api_key)
    response["api_key"] = raw_key
    return response


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
):
    api_key = db.query(ApiKey).filter(ApiKey.key_id == key_id).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    if api_key.revoked_at is None:
        api_key.revoked_at = datetime.utcnow()
        db.commit()
    return {"message": "API key revoked", "key_id": key_id}
