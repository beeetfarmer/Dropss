import logging
from typing import Literal, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from ..config import get_settings
from ..rate_limit import rate_limit
from ..security import require_admin_request
from ..services import spotify_account_service as account
from ..settings_store import load_overrides, save_overrides

router = APIRouter(prefix="/spotify", tags=["spotify-account"])
logger = logging.getLogger(__name__)
admin = [Depends(require_admin_request)]


class ConnectRequest(BaseModel):
    redirect_uri: Optional[str] = None


class PlaylistSelect(BaseModel):
    playlist_id: str = ""


class PlaylistTypes(BaseModel):
    types: list[Literal["album", "single"]] = Field(min_length=1)


class PlaylistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


def _resolve_redirect_uri(requested: Optional[str]) -> str:
    configured = get_settings().spotify_redirect_uri
    if configured:
        return configured
    parsed = urlparse(requested or "")
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or not parsed.path.endswith("/spotify/callback"):
        raise HTTPException(status_code=400, detail="Invalid redirect URI")
    return requested


def _set_override(key: str, value: str):
    overrides = load_overrides()
    if value:
        overrides[key] = value
    else:
        overrides.pop(key, None)
    save_overrides(overrides)
    get_settings.cache_clear()


def _set_playlist(playlist_id: str):
    _set_override("spotify_playlist_id", playlist_id)


@router.get("/account", dependencies=admin)
async def get_account_status(_: None = Depends(rate_limit(max_requests=30, window_seconds=60))):
    settings = get_settings()
    row = account.get_account()
    return {
        "credentials_configured": bool(settings.spotify_client_id and settings.spotify_client_secret),
        "fixed_redirect_uri": settings.spotify_redirect_uri or None,
        "connected": row is not None,
        "display_name": row.display_name if row else None,
        "connected_at": row.connected_at if row else None,
        "playlist": await account.playlist_summary(settings.spotify_playlist_id) if row else None,
        "playlist_types": [t for t in settings.spotify_playlist_types.split(",") if t],
    }


@router.post("/connect", dependencies=admin)
async def start_connect(body: ConnectRequest, _: None = Depends(rate_limit(max_requests=10, window_seconds=60))):
    settings = get_settings()
    if not (settings.spotify_client_id and settings.spotify_client_secret):
        raise HTTPException(status_code=400, detail="Spotify client credentials are not configured")
    return {"authorize_url": account.authorize_url(_resolve_redirect_uri(body.redirect_uri))}


@router.get("/callback")
async def oauth_callback(
    state: str = "",
    code: str = "",
    error: str = "",
    _: None = Depends(rate_limit(max_requests=10, window_seconds=60)),
):
    """Spotify redirects the browser here. Authenticated by the signed state,
    not the session cookie (which SameSite=Strict withholds on this hop)."""
    redirect_uri = account.read_state(state)
    if not redirect_uri:
        return RedirectResponse("/settings?spotify=invalid", status_code=303)
    if error or not code:
        return RedirectResponse("/settings?spotify=denied", status_code=303)
    try:
        await account.complete_connection(code, redirect_uri)
    except Exception as e:
        logger.warning("Spotify account connection failed: %s", type(e).__name__)
        return RedirectResponse("/settings?spotify=error", status_code=303)
    return RedirectResponse("/settings?spotify=connected", status_code=303)


@router.delete("/account", dependencies=admin)
async def disconnect_account():
    account.disconnect()
    _set_playlist("")
    return {"connected": False}


@router.get("/playlists", dependencies=admin)
async def list_playlists(_: None = Depends(rate_limit(max_requests=20, window_seconds=60))):
    if not account.get_account():
        raise HTTPException(status_code=400, detail="Spotify account not connected")
    try:
        return {"items": await account.editable_playlists()}
    except Exception as e:
        logger.warning("Listing Spotify playlists failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="Could not load playlists from Spotify")


@router.post("/playlists", dependencies=admin)
async def create_playlist(body: PlaylistCreate, _: None = Depends(rate_limit(max_requests=5, window_seconds=60))):
    if not account.get_account():
        raise HTTPException(status_code=400, detail="Spotify account not connected")
    try:
        playlist = await account.create_playlist(body.name.strip())
    except Exception as e:
        logger.warning("Creating Spotify playlist failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="Could not create playlist on Spotify")
    _set_playlist(playlist["id"])
    return playlist


@router.put("/playlist", dependencies=admin)
async def select_playlist(body: PlaylistSelect, _: None = Depends(rate_limit(max_requests=20, window_seconds=60))):
    if body.playlist_id:
        if not account.get_account():
            raise HTTPException(status_code=400, detail="Spotify account not connected")
        if body.playlist_id not in {p["id"] for p in await account.editable_playlists()}:
            raise HTTPException(status_code=400, detail="Playlist not found or not editable by the connected account")
    _set_playlist(body.playlist_id)
    return {"playlist_id": body.playlist_id or None}


@router.put("/playlist-types", dependencies=admin)
async def set_playlist_types(body: PlaylistTypes):
    types = sorted(set(body.types))
    _set_override("spotify_playlist_types", ",".join(types))
    return {"playlist_types": types}
