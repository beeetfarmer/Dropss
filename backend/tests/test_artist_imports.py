"""Top-artist imports from Last.fm and ListenBrainz."""
import asyncio
from functools import partial
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.config import APP_VERSION, get_settings
from app.models import Artist
from app.routes import integrations
from app.services import health

LASTFM = "/integrations/lastfm/import"
LISTENBRAINZ = "/integrations/listenbrainz/import"


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("LASTFM_API_KEY", "test-key")
    monkeypatch.setenv("LASTFM_USERNAME", "listener")
    monkeypatch.setenv("LISTENBRAINZ_USERNAME", "listener")
    get_settings.cache_clear()


@pytest.fixture
def upstream(monkeypatch):
    """Answers every outbound request with `reply`, and records the requests."""
    state = SimpleNamespace(reply=httpx.Response(200, json={}), requests=[])

    def handle(request):
        state.requests.append(request)
        if isinstance(state.reply, Exception):
            raise state.reply
        return state.reply

    monkeypatch.setattr(httpx, "AsyncClient", partial(httpx.AsyncClient, transport=httpx.MockTransport(handle)))
    return state


@pytest.fixture
def spotify(monkeypatch):
    async def search(name, limit):
        if name == "Unknown":
            return []
        return [SimpleNamespace(spotify_id=f"id-{name}", name=name, spotify_url=f"https://x/{name}", image_url=None)]

    service = MagicMock(search_artists=AsyncMock(side_effect=search))
    monkeypatch.setattr(integrations, "SpotifyService", lambda: service)
    return service


def lastfm_artists(*names):
    return httpx.Response(200, json={"topartists": {"artist": [{"name": n, "playcount": "3"} for n in names]}})


def listenbrainz_artists(*names):
    return httpx.Response(200, json={"payload": {"artists": [{"artist_name": n, "listen_count": 3} for n in names]}})


# --- both sources

@pytest.mark.parametrize("path, reply", [(LASTFM, lastfm_artists), (LISTENBRAINZ, listenbrainz_artists)])
def test_import_follows_new_artists(client, db, configured, upstream, spotify, path, reply):
    db.add(Artist(spotify_id="id-Old", name="Old", spotify_url="https://x/Old"))
    db.commit()
    upstream.reply = reply("Old", "New", "Unknown")

    response = client.post(path, json={})

    assert response.status_code == 200
    assert response.json() == {"total_artists": 3, "new_artists": 1, "existing_artists": 1, "artists_added": ["New"]}
    assert {a.name for a in db.query(Artist)} == {"Old", "New"}


@pytest.mark.parametrize("path", [LASTFM, LISTENBRAINZ])
def test_unconfigured_import_says_so(client, monkeypatch, upstream, path):
    for name in ("LASTFM_API_KEY", "LASTFM_USERNAME", "LISTENBRAINZ_USERNAME"):
        monkeypatch.setenv(name, "")
    get_settings.cache_clear()

    response = client.post(path, json={})

    assert response.status_code == 400
    assert "username" in response.json()["detail"]
    assert upstream.requests == []


@pytest.mark.parametrize("path", [LASTFM, LISTENBRAINZ])
@pytest.mark.parametrize("limit", [0, 201])
def test_limit_is_bounded(client, configured, path, limit):
    assert client.post(path, json={"limit": limit}).status_code == 422


# --- Last.fm without Pro

REFUSALS = [
    httpx.Response(403, json={"error": 10, "message": "Invalid API key"}),
    httpx.Response(403, json={"error": 26, "message": "API key suspended"}),
    httpx.Response(200, json={"error": 4, "message": "Authentication failed"}),
    httpx.Response(200, json={"error": 12, "message": "Subscribers only"}),
    httpx.Response(403, json={"error": 99, "message": "A code that does not exist yet"}),
    httpx.Response(401),
    httpx.Response(402, json={"message": "Payment required"}),
    httpx.Response(403, text="<html>Forbidden</html>"),
    httpx.Response(403, json=["unexpected"]),
]
NOT_REFUSALS = [
    httpx.Response(404, json={"error": 6, "message": "User not found"}),
    httpx.Response(403, json={"error": 17, "message": "Login required"}),
    httpx.Response(429, json={"error": 29, "message": "Rate limit exceeded"}),
    httpx.Response(500, json={"error": 8, "message": "Operation failed"}),
]


@pytest.mark.parametrize("reply", REFUSALS)
def test_refused_key_says_pro_is_required(client, configured, upstream, spotify, reply):
    upstream.reply = reply

    response = client.post(LASTFM, json={})

    # Never 401: the frontend treats that as a Dropss logout.
    assert response.status_code == 403
    assert "Last.fm Pro subscription" in response.json()["detail"]
    assert "test-key" not in response.text
    spotify.search_artists.assert_not_called()


@pytest.mark.parametrize("reply", NOT_REFUSALS)
def test_other_lastfm_errors_do_not_blame_pro(client, configured, upstream, reply):
    upstream.reply = reply

    response = client.post(LASTFM, json={})

    assert response.status_code == 502
    assert response.json()["detail"] == f"Last.fm API error: {reply.json()['message']}"


@pytest.mark.parametrize("reply", [httpx.Response(503), httpx.ConnectError("down")])
def test_lastfm_outage_is_a_plain_failure(client, configured, upstream, reply):
    upstream.reply = reply

    response = client.post(LASTFM, json={})

    assert response.status_code == 500
    assert response.json()["detail"] == "Failed to import Last.fm artists"


# --- ListenBrainz

def test_listenbrainz_request(client, configured, upstream, spotify):
    upstream.reply = listenbrainz_artists()

    assert client.post(LISTENBRAINZ, json={"period": "half_yearly", "limit": 200}).status_code == 200

    request = upstream.requests[0]
    assert str(request.url) == "https://api.listenbrainz.org/1/stats/user/listener/artists?range=half_yearly&count=200"
    assert request.headers["user-agent"] == f"Dropss/{APP_VERSION} ( https://github.com/beeetfarmer/Dropss )"
    assert "authorization" not in request.headers


def test_listenbrainz_username_cannot_change_the_path(client, configured, upstream, spotify, monkeypatch):
    monkeypatch.setenv("LISTENBRAINZ_USERNAME", "a/../b?x=1")
    get_settings.cache_clear()
    upstream.reply = listenbrainz_artists()

    client.post(LISTENBRAINZ, json={})

    assert upstream.requests[0].url.raw_path.startswith(b"/1/stats/user/a%2F..%2Fb%3Fx%3D1/artists?")


def test_listenbrainz_rejects_unknown_period(client, configured, upstream):
    assert client.post(LISTENBRAINZ, json={"period": "7day"}).status_code == 422
    assert upstream.requests == []


@pytest.mark.parametrize("reply, status, detail", [
    (httpx.Response(204), 400, "no statistics for that period"),
    (httpx.Response(404, json={"error": "Cannot find user"}), 400, "user not found"),
    (httpx.Response(429), 503, "rate limit"),
    (httpx.Response(500), 502, "HTTP 500"),
    (httpx.ConnectError("down"), 502, "Could not reach ListenBrainz"),
    (httpx.ReadTimeout("slow"), 502, "Could not reach ListenBrainz"),
    (httpx.Response(200, json={"unexpected": True}), 500, "Failed to import ListenBrainz artists"),
])
def test_listenbrainz_errors_are_explained(client, configured, upstream, spotify, reply, status, detail):
    upstream.reply = reply

    response = client.post(LISTENBRAINZ, json={})

    assert response.status_code == status
    assert detail in response.json()["detail"]


# --- settings and health

def test_listenbrainz_username_round_trips(client, monkeypatch):
    monkeypatch.setenv("LISTENBRAINZ_USERNAME", "")
    get_settings.cache_clear()

    client.put("/settings/", json={"listenbrainz_username": "someone"})

    assert client.get("/settings/").json()["listenbrainz_username"] == "someone"
    assert get_settings().listenbrainz_username == "someone"


def test_status_reports_listenbrainz(client, configured):
    assert client.get("/integrations/status").json()["listenbrainz_configured"] is True


def check(name):
    return asyncio.run(health._run(name, health.CHECKS[name][1], get_settings()))


@pytest.mark.parametrize("reply", REFUSALS)
def test_health_reports_pro_required(configured, upstream, reply):
    upstream.reply = reply
    assert check("lastfm") == "pro_required"


@pytest.mark.parametrize("reply", NOT_REFUSALS + [httpx.Response(503), httpx.ConnectError("down")])
def test_health_does_not_blame_pro_for_other_errors(configured, upstream, reply):
    upstream.reply = reply
    assert check("lastfm") == "error"


def test_lastfm_health_ok(configured, upstream):
    upstream.reply = httpx.Response(200, json={"user": {"name": "listener"}})
    assert check("lastfm") == "ok"


@pytest.mark.parametrize("status, expected", [(200, "ok"), (404, "error")])
def test_listenbrainz_health(configured, upstream, status, expected):
    upstream.reply = httpx.Response(status, json={})
    assert check("listenbrainz") == expected
    assert upstream.requests[0].url.path == "/1/user/listener/listen-count"
    assert upstream.requests[0].headers["user-agent"].startswith(f"Dropss/{APP_VERSION} ")
