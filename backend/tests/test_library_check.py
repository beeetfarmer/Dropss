import asyncio
from datetime import date, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from apscheduler.schedulers.background import BackgroundScheduler

from app import scheduler
from app.config import get_settings
from app.models import Artist, Release
from app.services import library_check

TRACKS = [{"id": "t1", "name": "Song"}]
JELLYFIN = library_check.LIBRARIES[0]
PLEX = library_check.LIBRARIES[1]
NAVIDROME = library_check.LIBRARIES[2]


def library_status(key, in_library=True, missing=()):
    return {
        "in_library": in_library,
        "match_type": "exact",
        "match_confidence": 0.9,
        f"{key}_album_id": f"{key}-album",
        "available_tracks": ["Song"] if in_library else [],
        "missing_tracks": list(missing),
    }


@pytest.fixture
def artist(db):
    row = Artist(spotify_id="a", name="Artist", spotify_url="https://x/a")
    db.add(row)
    db.commit()
    return row


def add_release(db, artist, name="album", released=None, **fields):
    release = Release(
        spotify_id=name, name=name, release_type="album",
        release_date=(released or date.today()).isoformat(),
        spotify_url=f"https://x/{name}", total_tracks=1, artist_id=artist.id, **fields,
    )
    db.add(release)
    db.commit()
    return release


@pytest.fixture
def clients(monkeypatch):
    """Fake clients for every library, all configured; a test can un-configure some."""
    fakes = {}
    libraries = []
    for library in library_check.LIBRARIES:
        client = MagicMock()
        client.check_album_in_library = AsyncMock(return_value=library_status(library.key))
        fakes[library.key] = client
        libraries.append(library.__class__(library.key, lambda c=client: c, lambda s: True, library.available_field, library.missing_field))
    monkeypatch.setattr(library_check, "LIBRARIES", tuple(libraries))
    return fakes


@pytest.fixture
def spotify(monkeypatch):
    service = MagicMock()
    service.get_album_tracks = AsyncMock(return_value=TRACKS)
    monkeypatch.setattr(library_check, "SpotifyService", lambda: service)
    monkeypatch.setattr(library_check.asyncio, "sleep", AsyncMock())
    return service


def only_configure(monkeypatch, *keys):
    monkeypatch.setattr(library_check, "LIBRARIES", tuple(
        lib.__class__(lib.key, lib.service, (lambda s, on=lib.key in keys: on), lib.available_field, lib.missing_field)
        for lib in library_check.LIBRARIES
    ))


def run(db):
    asyncio.run(library_check.check_libraries(db))


def test_results_are_saved_to_each_librarys_own_columns(db, artist, clients, spotify):
    release = add_release(db, artist)
    clients["plex"].check_album_in_library.return_value = library_status("plex", in_library=False, missing=["Song"])

    run(db)
    db.refresh(release)

    assert (release.in_jellyfin, release.jellyfin_album_id, release.available_tracks) == (True, "jellyfin-album", ["Song"])
    assert (release.in_plex, release.plex_missing_tracks, release.missing_tracks) == (False, ["Song"], [])
    assert (release.in_navidrome, release.navidrome_match_type, release.navidrome_match_confidence) == (True, "exact", 0.9)


def test_only_configured_libraries_are_checked(db, artist, clients, spotify, monkeypatch):
    release = add_release(db, artist)
    only_configure(monkeypatch, "navidrome")

    run(db)
    db.refresh(release)

    clients["jellyfin"].check_album_in_library.assert_not_awaited()
    assert release.in_jellyfin is None
    assert release.in_navidrome is True


def test_does_nothing_without_a_configured_library(db, artist, clients, spotify, monkeypatch):
    add_release(db, artist)
    only_configure(monkeypatch)

    run(db)

    spotify.get_album_tracks.assert_not_awaited()


def test_releases_outside_the_window_are_skipped(db, artist, clients, spotify):
    add_release(db, artist, "old", released=date.today() - timedelta(days=200))

    run(db)

    spotify.get_album_tracks.assert_not_awaited()


def test_a_release_complete_in_every_library_is_skipped(db, artist, clients, spotify):
    add_release(db, artist, in_jellyfin=True, missing_tracks=[], in_plex=True, plex_missing_tracks=[], in_navidrome=True, navidrome_missing_tracks=[])

    run(db)

    spotify.get_album_tracks.assert_not_awaited()
    clients["plex"].check_album_in_library.assert_not_awaited()


def test_only_incomplete_libraries_are_rechecked(db, artist, clients, spotify):
    add_release(db, artist, tracks=TRACKS, in_jellyfin=True, missing_tracks=[], in_plex=True, plex_missing_tracks=["Song"], in_navidrome=False)

    run(db)

    clients["jellyfin"].check_album_in_library.assert_not_awaited()
    clients["plex"].check_album_in_library.assert_awaited_once()
    clients["navidrome"].check_album_in_library.assert_awaited_once()


def test_a_release_that_was_missing_turns_up(db, artist, clients, spotify):
    release = add_release(db, artist, in_navidrome=False, navidrome_missing_tracks=["Song"], tracks=TRACKS)

    run(db)
    db.refresh(release)

    assert (release.in_navidrome, release.navidrome_missing_tracks) == (True, [])


def test_saved_tracks_avoid_a_spotify_call(db, artist, clients, spotify):
    add_release(db, artist, tracks=TRACKS)

    run(db)

    spotify.get_album_tracks.assert_not_awaited()
    assert clients["plex"].check_album_in_library.await_args.args == ("album", "Artist", TRACKS)


def test_fetched_tracks_are_saved_and_shared_between_libraries(db, artist, clients, spotify):
    release = add_release(db, artist)

    run(db)
    db.refresh(release)

    spotify.get_album_tracks.assert_awaited_once_with("album")
    assert release.tracks == TRACKS


def test_no_tracks_from_spotify_leaves_the_old_result_alone(db, artist, clients, spotify):
    release = add_release(db, artist, in_plex=False)
    spotify.get_album_tracks.return_value = []

    run(db)
    db.refresh(release)

    assert release.in_plex is False
    clients["plex"].check_album_in_library.assert_not_awaited()


def test_one_library_failing_does_not_stop_the_others(db, artist, clients, spotify):
    first = add_release(db, artist, "first", tracks=TRACKS)
    second = add_release(db, artist, "second", tracks=TRACKS)
    clients["jellyfin"].check_album_in_library.side_effect = RuntimeError("server down")

    run(db)
    db.refresh(first)
    db.refresh(second)

    assert (first.in_jellyfin, first.in_plex, first.in_navidrome) == (None, True, True)
    assert (second.in_jellyfin, second.in_plex) == (None, True)


def test_failures_do_not_log_error_text(db, artist, clients, spotify, caplog):
    add_release(db, artist, tracks=TRACKS)
    clients["navidrome"].check_album_in_library.side_effect = RuntimeError("http://nd/rest?t=secret-token")

    run(db)

    assert "secret-token" not in caplog.text


@pytest.mark.parametrize("library, settings, expected", [
    (JELLYFIN, {"jellyfin_url": "http://j", "jellyfin_api_key": "k"}, True),
    (JELLYFIN, {"jellyfin_url": "http://j"}, False),
    (PLEX, {"plex_url": "http://p", "plex_token": "t"}, True),
    (PLEX, {"plex_token": "t"}, False),
    (NAVIDROME, {"navidrome_url": "http://n", "navidrome_username": "u", "navidrome_password": "p"}, True),
    (NAVIDROME, {"navidrome_url": "http://n", "navidrome_username": "u"}, False),
])
def test_configured_detection(library, settings, expected):
    assert library.configured(get_settings().model_copy(update={
        "jellyfin_url": "", "jellyfin_api_key": "", "plex_url": "", "plex_token": "",
        "navidrome_url": "", "navidrome_username": "", "navidrome_password": "", **settings,
    })) is expected


def scheduled(monkeypatch, library_time, existing_job=False):
    settings = get_settings().model_copy(update={"release_check_time": "09:00", "timezone": "UTC", "library_check_time": library_time})
    monkeypatch.setattr(scheduler, "get_settings", lambda: settings)
    job_scheduler = MagicMock(running=True)
    job_scheduler.get_job.return_value = object() if existing_job else None
    monkeypatch.setattr(scheduler, "scheduler", job_scheduler)
    scheduler.start_scheduler()
    return job_scheduler


def library_job(job_scheduler):
    return next((c for c in job_scheduler.add_job.call_args_list if c.kwargs["id"] == "daily_library_check"), None)


def test_library_job_is_scheduled_at_the_set_time(monkeypatch):
    call = library_job(scheduled(monkeypatch, "03:30"))

    fields = {f.name: str(f) for f in call.kwargs["trigger"].fields}
    assert (fields["hour"], fields["minute"]) == ("3", "30")
    assert call.args == (scheduler.run_library_check,)
    assert call.kwargs["misfire_grace_time"] == 3600


def test_no_library_job_when_the_time_is_blank(monkeypatch):
    job_scheduler = scheduled(monkeypatch, "")

    assert library_job(job_scheduler) is None
    job_scheduler.remove_job.assert_not_called()


def test_blanking_the_time_removes_the_existing_job(monkeypatch):
    job_scheduler = scheduled(monkeypatch, "", existing_job=True)

    job_scheduler.remove_job.assert_called_once_with("daily_library_check")


@pytest.mark.parametrize("value", ["nonsense", "25:00", "12:99"])
def test_invalid_time_turns_the_job_off_instead_of_guessing(monkeypatch, value):
    assert library_job(scheduled(monkeypatch, value)) is None


def test_job_lifecycle_on_a_real_scheduler(monkeypatch):
    real = BackgroundScheduler()
    real.start(paused=True)
    monkeypatch.setattr(scheduler, "scheduler", real)
    settings = get_settings().model_copy(update={"release_check_time": "09:00", "timezone": "UTC", "library_check_time": "03:30"})
    monkeypatch.setattr(scheduler, "get_settings", lambda: settings)

    try:
        scheduler.start_scheduler()
        assert real.get_job("daily_library_check") is not None
        assert real.get_job("daily_release_check") is not None

        settings.library_check_time = "04:45"
        scheduler.start_scheduler()
        assert "hour='4', minute='45'" in str(real.get_job("daily_library_check").trigger)
        assert len(real.get_jobs()) == 2

        settings.library_check_time = ""
        scheduler.start_scheduler()
        assert real.get_job("daily_library_check") is None
        assert real.get_job("daily_release_check") is not None

        scheduler.start_scheduler()  # blank again: nothing left to remove
    finally:
        real.shutdown()


def test_run_library_check_uses_its_own_session(session_factory, monkeypatch):
    check = AsyncMock()
    monkeypatch.setattr(scheduler, "check_libraries", check)

    scheduler.run_library_check()

    check.assert_awaited_once()
