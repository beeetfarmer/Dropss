import asyncio
import threading
import time
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import spotipy

from app import scheduler
from app.models import Artist, Release
from app.services.spotify_service import MAX_RETRY_AFTER_SECONDS, SpotifyRateLimited, SpotifyServiceError, build_client


def add_artists(db, *names, **fields):
    for name in names:
        db.add(Artist(spotify_id=name, name=name, spotify_url=f"https://x/{name}", **fields))
    db.commit()


def release_data(spotify_id):
    return {
        "spotify_id": spotify_id,
        "name": spotify_id,
        "release_type": "album",
        "release_date": date.today().isoformat(),
        "spotify_url": f"https://x/{spotify_id}",
        "image_url": None,
        "total_tracks": 1,
    }


@pytest.fixture
def spotify(monkeypatch, session_factory):
    service = MagicMock()
    service.get_artist_releases = AsyncMock(return_value=[])
    monkeypatch.setattr(scheduler, "SpotifyService", lambda: service)
    monkeypatch.setattr(scheduler, "configured_notifiers", lambda: [])
    monkeypatch.setattr(scheduler.asyncio, "sleep", AsyncMock())
    return service


def wait_until_idle():
    deadline = time.monotonic() + 5
    while scheduler.check_status()["running"] and time.monotonic() < deadline:
        time.sleep(0.01)
    assert not scheduler.check_status()["running"]


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
        with pytest.raises(spotipy.SpotifyException) as raised:
            client.artist_albums("x")
    server.shutdown()

    assert raised.value.http_status == 429
    assert sleeps and max(sleeps) <= MAX_RETRY_AFTER_SECONDS


def test_new_release_is_saved_notified_and_marked(db, spotify, monkeypatch):
    add_artists(db, "a")
    spotify.get_artist_releases.return_value = [release_data("r1")]
    notifier = MagicMock()
    notifier.send_release_notification = AsyncMock()
    monkeypatch.setattr(scheduler, "configured_notifiers", lambda: [notifier])

    asyncio.run(scheduler.check_for_new_releases())

    release = db.query(Release).one()
    assert (release.spotify_id, release.is_new, release.notified) == ("r1", True, True)
    assert db.query(Artist).one().last_checked is not None
    notifier.send_release_notification.assert_awaited_once()


def test_known_release_is_not_added_or_notified_again(db, spotify, monkeypatch):
    add_artists(db, "a")
    spotify.get_artist_releases.return_value = [release_data("r1")]
    asyncio.run(scheduler.check_for_new_releases())

    notifier = MagicMock()
    notifier.send_release_notification = AsyncMock()
    monkeypatch.setattr(scheduler, "configured_notifiers", lambda: [notifier])
    asyncio.run(scheduler.check_for_new_releases())

    assert db.query(Release).count() == 1
    notifier.send_release_notification.assert_not_awaited()


def test_one_failing_artist_does_not_stop_the_sweep(db, spotify):
    add_artists(db, "a", "b", "c")
    spotify.get_artist_releases.side_effect = [SpotifyServiceError("boom"), [], []]

    asyncio.run(scheduler.check_for_new_releases())

    assert spotify.get_artist_releases.await_count == 3


def test_rate_limit_stops_the_sweep(db, spotify):
    add_artists(db, "a", "b", "c")
    spotify.get_artist_releases.side_effect = SpotifyRateLimited("limited", 503)

    asyncio.run(scheduler.check_for_new_releases())

    assert spotify.get_artist_releases.await_count == 1


def test_stalest_artist_is_checked_first(db, spotify):
    add_artists(db, "never")
    add_artists(db, "recent", last_checked=datetime(2026, 2, 1))
    add_artists(db, "stale", last_checked=datetime(2026, 1, 1))

    asyncio.run(scheduler.check_for_new_releases())

    order = [call.args[0] for call in spotify.get_artist_releases.await_args_list]
    assert order == ["never", "stale", "recent"]


def test_manual_check_holds_the_lock_and_reports_failures(db, spotify):
    add_artists(db, "a", "b", "c")
    gate = threading.Event()

    async def blocked(artist_id, months_back):
        await asyncio.to_thread(gate.wait, 5)
        raise SpotifyRateLimited("limited", 503)

    spotify.get_artist_releases = blocked

    assert scheduler.start_manual_check() is True
    assert scheduler.check_status()["running"] is True
    assert scheduler.start_manual_check() is False
    scheduler.run_sync_check()  # skipped: the manual check holds the lock
    assert scheduler.check_status()["running"] is True

    gate.set()
    wait_until_idle()
    status = scheduler.check_status()
    assert (status["new_releases"], status["failed"]) == (0, 3)


def test_lock_is_released_when_the_check_crashes(session_factory, monkeypatch):
    monkeypatch.setattr(scheduler, "SessionLocal", MagicMock(side_effect=RuntimeError("no db")))

    with pytest.raises(RuntimeError):
        scheduler.run_sync_check()

    assert scheduler.check_status()["running"] is False


@pytest.mark.parametrize("check_time, expected", [("07:20", ("7", "20")), ("nonsense", ("9", "0"))])
def test_scheduler_job_setup(monkeypatch, check_time, expected):
    from app.config import get_settings

    settings = get_settings().model_copy(update={"release_check_time": check_time, "timezone": "Not/AZone"})
    monkeypatch.setattr(scheduler, "get_settings", lambda: settings)
    job_scheduler = MagicMock(running=False)
    monkeypatch.setattr(scheduler, "scheduler", job_scheduler)

    scheduler.start_scheduler()

    kwargs = job_scheduler.add_job.call_args.kwargs
    fields = {f.name: str(f) for f in kwargs["trigger"].fields}
    assert (fields["hour"], fields["minute"]) == expected
    assert str(kwargs["trigger"].timezone) == "UTC"
    assert kwargs["misfire_grace_time"] == 3600
    job_scheduler.start.assert_called_once()
