"""Run: python -m tests.test_release_check (from backend/)."""
import asyncio
import os
import tempfile
import threading
from datetime import date
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import AsyncMock, MagicMock, patch

import spotipy
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import scheduler
from app.config import get_settings
from app.database import Base
from app.models import Artist, Release
from app.routes.releases import get_latest_releases
from app.routes.settings import SettingsUpdate, get_settings_endpoint, update_settings
from app.services.spotify_service import MAX_RETRY_AFTER_SECONDS, SpotifyRateLimited, build_client


def test_long_retry_after_is_capped():
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(429)
            self.send_header("Retry-After", "86400")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    auth = MagicMock()
    auth.get_access_token.return_value = "token"
    client = build_client(auth)
    client.prefix = f"http://127.0.0.1:{server.server_port}/v1/"

    sleeps = []
    with patch("urllib3.util.retry.time.sleep", side_effect=sleeps.append):
        try:
            client.artist_albums("x")
            raise AssertionError("expected a 429")
        except spotipy.SpotifyException as e:
            assert e.http_status == 429
    server.shutdown()

    assert sleeps and max(sleeps) <= MAX_RETRY_AFTER_SECONDS


def _session_with_artists(*names):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    with Session() as db:
        for name in names:
            db.add(Artist(spotify_id=name, name=name, spotify_url=f"https://x/{name}"))
        db.commit()
    return Session


def test_rate_limit_stops_the_sweep():
    Session = _session_with_artists("a", "b", "c")
    calls = []

    async def rate_limited(artist_id, months_back):
        calls.append(artist_id)
        raise SpotifyRateLimited("limited", 503)

    spotify = MagicMock()
    spotify.get_artist_releases = rate_limited
    with patch.object(scheduler, "SessionLocal", Session), \
            patch.object(scheduler, "SpotifyService", return_value=spotify), \
            patch.object(scheduler, "configured_notifiers", return_value=[]), \
            patch.object(scheduler.asyncio, "sleep", AsyncMock()):
        asyncio.run(scheduler.check_for_new_releases())

    assert len(calls) == 1


def test_stalest_artist_is_checked_first():
    from datetime import datetime

    Session = _session_with_artists("recent", "stale", "never")
    with Session() as db:
        db.query(Artist).filter_by(name="recent").update({"last_checked": datetime(2026, 2, 1)})
        db.query(Artist).filter_by(name="stale").update({"last_checked": datetime(2026, 1, 1)})
        db.commit()

    calls = []

    async def record(artist_id, months_back):
        calls.append(artist_id)
        return []

    spotify = MagicMock()
    spotify.get_artist_releases = record
    with patch.object(scheduler, "SessionLocal", Session), \
            patch.object(scheduler, "SpotifyService", return_value=spotify), \
            patch.object(scheduler, "configured_notifiers", return_value=[]), \
            patch.object(scheduler.asyncio, "sleep", AsyncMock()):
        asyncio.run(scheduler.check_for_new_releases())

    assert calls == ["never", "stale", "recent"]


def test_hide_seen_releases_setting_filters_latest():
    Session = _session_with_artists("a")
    with Session() as db:
        artist = db.query(Artist).one()
        today = date.today().isoformat()
        for name, is_new in (("seen", False), ("unseen", True)):
            db.add(Release(
                spotify_id=name, name=name, release_type="album", release_date=today,
                spotify_url=f"https://x/{name}", total_tracks=1, artist_id=artist.id, is_new=is_new,
            ))
        db.commit()

    async def latest_names():
        with Session() as db:
            return {r.name for r in await get_latest_releases(limit=100, db=db, _=None)}

    async def save(value):
        await update_settings(SettingsUpdate(hide_seen_releases=value), _=None)
        return (await get_settings_endpoint(_=None))["hide_seen_releases"]

    with tempfile.TemporaryDirectory() as tmp, \
            patch.dict(os.environ, {"SETTINGS_OVERRIDES_FILE": f"{tmp}/overrides.json"}):
        get_settings.cache_clear()
        assert asyncio.run(latest_names()) == {"seen", "unseen"}
        assert asyncio.run(save(True)) is True
        assert asyncio.run(latest_names()) == {"unseen"}
        assert asyncio.run(save(False)) is False
        assert asyncio.run(latest_names()) == {"seen", "unseen"}
    get_settings.cache_clear()


if __name__ == "__main__":
    test_long_retry_after_is_capped()
    test_rate_limit_stops_the_sweep()
    test_stalest_artist_is_checked_first()
    test_hide_seen_releases_setting_filters_latest()
    print("ok")
