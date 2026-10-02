"""Run: python -m tests.test_spotify_account (from backend/)."""
import json
import time
from unittest.mock import patch

from fastapi import HTTPException

from app.routes.spotify_account import _resolve_redirect_uri
from app.services import spotify_account_service as account

CALLBACK = "http://127.0.0.1:8093/api/spotify/callback"


def test_state_roundtrip_and_tamper():
    state = account.make_state(CALLBACK)
    assert account.read_state(state) == CALLBACK
    body, sig = state.rsplit(".", 1)
    assert account.read_state(f"{body}.{'0' * len(sig)}") is None
    assert account.read_state(body[:-2] + "AA." + sig) is None
    assert account.read_state("") is None and account.read_state("garbage") is None


def test_state_expires():
    state = account.make_state(CALLBACK)
    with patch("app.services.spotify_account_service.time.time", return_value=time.time() + account.STATE_TTL_SECONDS + 5):
        assert account.read_state(state) is None


def test_token_encrypted_at_rest():
    token = {"access_token": "AT-secret", "refresh_token": "RT-secret", "expires_at": 1}
    blob = account._encrypt(token)
    assert "RT-secret" not in blob
    assert json.loads(account._fernet().decrypt(blob.encode())) == token


def test_redirect_uri_validation():
    assert _resolve_redirect_uri(CALLBACK) == CALLBACK
    for bad in ["", "javascript:alert(1)", "https://evil.example/elsewhere", "ftp://x/spotify/callback"]:
        try:
            _resolve_redirect_uri(bad)
            raise AssertionError(f"accepted {bad!r}")
        except HTTPException:
            pass


def _t(tid, name, artist="A"):
    return {"id": tid, "name": name, "artist_ids": [artist]}


def _item(tid, name, album_type, artist="A"):
    return {"uri": f"spotify:track:{tid}", "name": name, "artist_ids": [artist], "album_type": album_type}


def test_plan_skips_tracks_already_in_playlist():
    remove, add = account.plan_sync(
        [_item("1", "Song", "album")],
        [{"release_type": "album", "tracks": [_t("1", "Song"), _t("2", "Other")]}],
    )
    assert (remove, add) == ([], ["spotify:track:2"])


def test_plan_album_wins_within_one_batch():
    # Single arrives in the same batch as its album: only the album cut is added.
    remove, add = account.plan_sync([], [
        {"release_type": "single", "tracks": [_t("s1", "Hit (feat. B)")]},
        {"release_type": "album", "tracks": [_t("a1", "Hit"), _t("a2", "Deep Cut")]},
    ])
    assert remove == [] and add == ["spotify:track:a1", "spotify:track:a2"]


def test_plan_album_replaces_earlier_single():
    remove, add = account.plan_sync(
        [_item("s1", "Hit", "single")],
        [{"release_type": "album", "tracks": [_t("a1", "Hit")]}],
    )
    assert (remove, add) == (["spotify:track:s1"], ["spotify:track:a1"])


def test_plan_single_never_replaces_album_and_versions_stay_distinct():
    remove, add = account.plan_sync(
        [_item("a1", "Hit", "album")],
        [{"release_type": "single", "tracks": [_t("s1", "Hit"), _t("s2", "Hit (Remix)"), _t("s3", "Hit", artist="Other")]}],
    )
    assert remove == [] and add == ["spotify:track:s2", "spotify:track:s3"]


def test_sync_respects_release_type_filter():
    import asyncio
    sync = account.SpotifyPlaylistSync("pl", {"album"})
    with patch.object(account, "user_client", side_effect=AssertionError("should not reach Spotify")):
        assert asyncio.run(sync.send_release_notification("A", [{"release_type": "single", "spotify_id": "x"}])) is True


def test_loopback_origins_are_aliases():
    from app.config import Settings
    from app.security import _allowed_origins
    with patch("app.security.get_settings", return_value=Settings(cors_origins="http://localhost:8093,https://dropss.example.com")):
        allowed = _allowed_origins()
    assert {"http://127.0.0.1:8093", "http://[::1]:8093", "https://dropss.example.com"} <= allowed
    assert "http://127.0.0.1:9999" not in allowed and "https://127.0.0.1" not in allowed


if __name__ == "__main__":
    test_plan_skips_tracks_already_in_playlist()
    test_plan_album_wins_within_one_batch()
    test_plan_album_replaces_earlier_single()
    test_plan_single_never_replaces_album_and_versions_stay_distinct()
    test_sync_respects_release_type_filter()
    test_loopback_origins_are_aliases()
    test_state_roundtrip_and_tamper()
    test_state_expires()
    test_token_encrypted_at_rest()
    test_redirect_uri_validation()
    print("ok")
