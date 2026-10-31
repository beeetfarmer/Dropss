from datetime import date, timedelta
from unittest.mock import patch

import pytest

from app.config import get_settings
from app.models import Artist, Release


@pytest.fixture
def artist(db):
    row = Artist(spotify_id="a", name="Artist", spotify_url="https://x/a")
    db.add(row)
    db.commit()
    return row


def add_release(db, artist, name, is_new=True, release_type="album", released=None):
    db.add(Release(
        spotify_id=name, name=name, release_type=release_type,
        release_date=(released or date.today()).isoformat(),
        spotify_url=f"https://x/{name}", total_tracks=1, artist_id=artist.id, is_new=is_new,
    ))
    db.commit()


def latest_names(client):
    return {r["name"] for r in client.get("/releases/latest").json()}


def test_latest_includes_artist_name_and_skips_old_releases(client, db, artist):
    add_release(db, artist, "fresh")
    add_release(db, artist, "old", released=date.today() - timedelta(days=200))

    body = client.get("/releases/latest").json()

    assert [(r["name"], r["artist_name"]) for r in body] == [("fresh", "Artist")]


def test_hide_seen_setting_filters_latest_both_ways(client, db, artist):
    add_release(db, artist, "seen", is_new=False)
    add_release(db, artist, "unseen")
    assert latest_names(client) == {"seen", "unseen"}

    assert client.put("/settings/", json={"hide_seen_releases": True}).status_code == 200
    assert latest_names(client) == {"unseen"}

    assert client.put("/settings/", json={"hide_seen_releases": False}).status_code == 200
    assert latest_names(client) == {"seen", "unseen"}


def test_limit_applies_after_hiding_seen_releases(client, db, artist):
    today = date.today()
    add_release(db, artist, "seen-newer", is_new=False, released=today)
    add_release(db, artist, "unseen-older", released=today - timedelta(days=1))
    client.put("/settings/", json={"hide_seen_releases": True})

    body = client.get("/releases/latest", params={"limit": 1}).json()

    assert [r["name"] for r in body] == ["unseen-older"]


def test_marking_a_release_seen_hides_it_when_setting_is_on(client, db, artist):
    add_release(db, artist, "unseen")
    client.put("/settings/", json={"hide_seen_releases": True})
    release_id = client.get("/releases/latest").json()[0]["id"]

    assert client.post(f"/releases/{release_id}/mark-seen").status_code == 200

    assert latest_names(client) == set()


def test_mark_all_seen_and_stats(client, db, artist):
    add_release(db, artist, "album-1")
    add_release(db, artist, "single-1", release_type="single")
    assert client.get("/releases/stats").json()["new_releases"] == 2

    assert client.post("/releases/mark-all-seen").json()["message"] == "Marked 2 releases as seen"

    stats = client.get("/releases/stats").json()
    assert stats["new_releases"] == 0
    assert stats["total_releases"] == 2
    assert stats["by_type"] == {"albums": 1, "singles": 1, "eps": 0}


@pytest.mark.parametrize("started", [True, False])
def test_refresh_reports_whether_a_new_check_started(client, started):
    with patch("app.routes.releases.start_manual_check", return_value=started):
        response = client.post("/releases/refresh")

    assert response.status_code == 200
    assert response.json() == {"started": started}


def test_refresh_status_is_exposed(client):
    assert client.get("/releases/refresh").json()["running"] is False


def test_refresh_is_rate_limited(client):
    with patch("app.routes.releases.start_manual_check", return_value=False):
        codes = [client.post("/releases/refresh").status_code for _ in range(6)]

    assert codes == [200] * 5 + [429]


def test_refresh_endpoints_require_authentication(client, monkeypatch):
    monkeypatch.setenv("AUTH_ENABLED", "true")
    monkeypatch.setenv("APP_PASSWORD", "test-password")
    get_settings.cache_clear()

    with patch("app.routes.releases.start_manual_check") as start:
        assert client.get("/releases/refresh").status_code == 401
        assert client.post("/releases/refresh").status_code in (401, 403)

    start.assert_not_called()
