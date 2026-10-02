"""Spotify *user* account: OAuth connection and playlist sync.

Everything else in Dropss uses app-only client credentials, which can read the
catalogue but cannot touch anyone's playlists. Adding releases to a playlist
needs a user token, obtained once via the authorization-code flow and kept
(encrypted) in the spotify_account table.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
import time
from datetime import datetime
from typing import Optional

import spotipy
from cryptography.fernet import Fernet, InvalidToken
from spotipy.cache_handler import CacheHandler
from spotipy.oauth2 import SpotifyOAuth

from ..config import get_settings
from ..database import SessionLocal
from ..models import SpotifyAccount
from ..security import _require_secret_key
from .spotify_service import SpotifyService

logger = logging.getLogger(__name__)

SCOPES = "playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public"
STATE_TTL_SECONDS = 600
ADD_BATCH = 50


def _derived_key(purpose: str) -> bytes:
    return hashlib.sha256(f"dropss:{purpose}:{_require_secret_key()}".encode()).digest()


def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(_derived_key("spotify-token")))


# --- OAuth state -----------------------------------------------------------
# The callback arrives as a cross-site navigation from accounts.spotify.com, so
# a SameSite=Strict session cookie is not sent with it. Instead the state is a
# short-lived token signed with the app secret, minted only by an
# authenticated admin request, and carrying the redirect URI to use.

def make_state(redirect_uri: str) -> str:
    payload = json.dumps({"r": redirect_uri, "e": int(time.time()) + STATE_TTL_SECONDS, "n": secrets.token_urlsafe(8)})
    body = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    sig = hmac.new(_derived_key("spotify-state"), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def read_state(state: str) -> Optional[str]:
    """Return the redirect URI from a valid, unexpired state, else None."""
    try:
        body, sig = state.rsplit(".", 1)
        expected = hmac.new(_derived_key("spotify-state"), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        return data["r"] if data["e"] >= time.time() else None
    except Exception:
        return None


# --- token storage ---------------------------------------------------------

class _DbTokenCache(CacheHandler):
    """spotipy cache handler backed by the encrypted spotify_account row."""

    def __init__(self, pending: Optional[dict] = None):
        # During the initial code exchange there is no row yet; spotipy hands
        # us the token and the caller persists it together with the profile.
        self.pending = pending

    def get_cached_token(self):
        if self.pending is not None:
            return self.pending or None
        with SessionLocal() as db:
            row = db.get(SpotifyAccount, 1)
            if not row:
                return None
            try:
                return json.loads(_fernet().decrypt(row.token_encrypted.encode()))
            except InvalidToken:
                logger.warning("Stored Spotify token cannot be decrypted (APP_SECRET_KEY changed?); reconnect needed")
                return None

    def save_token_to_cache(self, token_info):
        if self.pending is not None:
            self.pending.clear()
            self.pending.update(token_info)
            return
        with SessionLocal() as db:
            row = db.get(SpotifyAccount, 1)
            if row:
                row.token_encrypted = _encrypt(token_info)
                db.commit()


def _encrypt(token_info: dict) -> str:
    return _fernet().encrypt(json.dumps(token_info).encode()).decode()


def _oauth(redirect_uri: str, cache: CacheHandler) -> SpotifyOAuth:
    settings = get_settings()
    return SpotifyOAuth(
        client_id=settings.spotify_client_id,
        client_secret=settings.spotify_client_secret,
        redirect_uri=redirect_uri,
        scope=SCOPES,
        cache_handler=cache,
        open_browser=False,
        requests_timeout=10,
    )


def authorize_url(redirect_uri: str) -> str:
    return _oauth(redirect_uri, _DbTokenCache(pending={})).get_authorize_url(state=make_state(redirect_uri))


async def complete_connection(code: str, redirect_uri: str) -> SpotifyAccount:
    pending: dict = {}
    oauth = _oauth(redirect_uri, _DbTokenCache(pending=pending))
    await asyncio.to_thread(oauth.get_access_token, code, as_dict=False, check_cache=False)
    me = await asyncio.to_thread(spotipy.Spotify(auth_manager=oauth, requests_timeout=10).me)

    with SessionLocal() as db:
        row = db.get(SpotifyAccount, 1) or SpotifyAccount(id=1)
        row.spotify_user_id = me["id"]
        row.display_name = me.get("display_name") or me["id"]
        row.redirect_uri = redirect_uri
        row.token_encrypted = _encrypt(pending)
        row.connected_at = datetime.utcnow()
        db.merge(row)
        db.commit()
        return db.get(SpotifyAccount, 1)


def get_account() -> Optional[SpotifyAccount]:
    with SessionLocal() as db:
        row = db.get(SpotifyAccount, 1)
        if row:
            db.expunge(row)
        return row


def disconnect():
    with SessionLocal() as db:
        row = db.get(SpotifyAccount, 1)
        if row:
            db.delete(row)
            db.commit()


def user_client() -> Optional[spotipy.Spotify]:
    account = get_account()
    if not account:
        return None
    return spotipy.Spotify(auth_manager=_oauth(account.redirect_uri, _DbTokenCache()), requests_timeout=10)


# --- playlists -------------------------------------------------------------

def _playlist_summary(p: dict) -> dict:
    images = p.get("images") or []
    return {
        "id": p["id"],
        "name": p["name"],
        "url": p.get("external_urls", {}).get("spotify", ""),
        "image_url": images[0]["url"] if images else None,
        "owner_id": (p.get("owner") or {}).get("id"),
        "collaborative": p.get("collaborative", False),
    }


async def editable_playlists() -> list[dict]:
    """Playlists the connected user can add to: ones they own or collaborate on."""
    client = user_client()
    account = get_account()
    if not client or not account:
        return []
    playlists, page = [], await asyncio.to_thread(client.current_user_playlists, limit=50)
    while page:
        playlists += [_playlist_summary(p) for p in page["items"] if p]
        page = await asyncio.to_thread(client.next, page) if page.get("next") else None
    return [p for p in playlists if p["owner_id"] == account.spotify_user_id or p["collaborative"]]


async def create_playlist(name: str) -> dict:
    client = user_client()
    if not client:
        raise RuntimeError("Spotify account not connected")
    # POST /users/{id}/playlists was removed in the Feb 2026 API changes.
    created = await asyncio.to_thread(client._post, "me/playlists", payload={
        "name": name, "public": False, "description": "New releases from artists followed in Dropss",
    })
    return _playlist_summary(created)


async def playlist_summary(playlist_id: str) -> Optional[dict]:
    client = user_client()
    if not client or not playlist_id:
        return None
    try:
        return _playlist_summary(await asyncio.to_thread(client.playlist, playlist_id, fields="id,name,external_urls,images,owner,collaborative"))
    except Exception as e:
        logger.warning("Could not load Spotify playlist: %s", type(e).__name__)
        return None


# --- sync planning (pure, so it is testable without Spotify) ----------------

TYPE_PRIORITY = {"album": 0, "compilation": 1, "single": 2}
_FEATURING = re.compile(r"\s*[\(\[](?:feat\.?|ft\.?|featuring|with)\s[^\)\]]*[\)\]]", re.IGNORECASE)


def song_key(name: str, artist_ids: list) -> tuple:
    """Identity of a song across releases: the single and the album cut of the
    same song have different track ids but the same title and lead artist.
    "(feat. X)" credits are ignored; other qualifiers (Remix, Live, ...) are not,
    so genuinely different versions are kept."""
    title = re.sub(r"\s+", " ", _FEATURING.sub("", name)).strip().casefold()
    return title, (artist_ids[0] if artist_ids else "")


def plan_sync(existing: list[dict], releases: list[dict]) -> tuple[list[str], list[str]]:
    """Decide what to remove from and add to the playlist.

    existing: playlist items as {uri, name, artist_ids, album_type}
    releases: {release_type, tracks: [{id, name, artist_ids}]}, already filtered by type

    Returns (uris_to_remove, uris_to_add). Albums win: releases are processed
    album-first, and an album track replaces a non-album copy of the same song
    already in the playlist. Nothing is ever added twice.
    """
    present_uris = {item["uri"] for item in existing}
    by_song = {song_key(item["name"], item["artist_ids"]): item for item in existing}
    remove, add = [], []

    for release in sorted(releases, key=lambda r: TYPE_PRIORITY.get(r["release_type"], 9)):
        is_album = release["release_type"] == "album"
        for track in release["tracks"]:
            uri = f"spotify:track:{track['id']}"
            if uri in present_uris:
                continue
            key = song_key(track["name"], track["artist_ids"])
            current = by_song.get(key)
            if current:
                if not (is_album and current["album_type"] != "album"):
                    continue
                if current["uri"] in add:
                    add.remove(current["uri"])
                else:
                    remove.append(current["uri"])
            add.append(uri)
            present_uris.add(uri)
            by_song[key] = {"uri": uri, "album_type": release["release_type"]}

    return remove, add


class SpotifyPlaylistSync:
    """Adds the tracks of newly discovered releases to the configured playlist,
    skipping songs already there and preferring album versions (see plan_sync).

    Implements send_release_notification so it plugs into the same
    new-release fan-out as the notification services.
    """

    def __init__(self, playlist_id: str, release_types: set[str]):
        self.playlist_id = playlist_id
        self.release_types = release_types

    async def _existing_items(self, client) -> list[dict]:
        items = []
        page = await asyncio.to_thread(
            client.playlist_items, self.playlist_id, limit=50, additional_types=("track",),
            fields="items(track(uri,name,artists(id),album(album_type))),next",
        )
        while page:
            for entry in page["items"]:
                track = entry.get("track") or {}
                if track.get("uri", "").startswith("spotify:track:"):
                    items.append({
                        "uri": track["uri"],
                        "name": track.get("name", ""),
                        "artist_ids": [a["id"] for a in track.get("artists") or [] if a.get("id")],
                        "album_type": (track.get("album") or {}).get("album_type", ""),
                    })
            page = await asyncio.to_thread(client.next, page) if page.get("next") else None
        return items

    async def send_release_notification(self, artist_name: str, releases: list) -> bool:
        wanted = [r for r in releases if r.get("release_type") in self.release_types]
        if not wanted:
            return True
        client = user_client()
        if not client:
            return False
        try:
            catalogue = SpotifyService()
            prepared = [
                {"release_type": r["release_type"], "tracks": await catalogue.get_album_tracks(r["spotify_id"])}
                for r in wanted
            ]
            remove, add = plan_sync(await self._existing_items(client), prepared)
            for i in range(0, len(remove), ADD_BATCH):
                await asyncio.to_thread(client.playlist_remove_all_occurrences_of_items, self.playlist_id, remove[i:i + ADD_BATCH])
            for i in range(0, len(add), ADD_BATCH):
                await asyncio.to_thread(client.playlist_add_items, self.playlist_id, add[i:i + ADD_BATCH])
            logger.info(
                "Spotify playlist sync for %s: %d added, %d replaced by album versions",
                artist_name, len(add), len(remove),
            )
            return True
        except Exception as e:
            # Type only: spotipy errors can include request URLs.
            logger.warning("Spotify playlist sync failed: %s", type(e).__name__)
            return False
