"""Playlist sync end to end, against an in-memory Spotify playlist."""
import asyncio

import pytest

from app.services import spotify_account_service as account


class FakeSpotify:
    def __init__(self):
        self.playlists = {}
        self.albums = {}
        self.catalogue = {}
        self.add_calls = 0
        self.fail_add_on_call = None

    def release(self, release_id, release_type, *tracks):
        """tracks are (id, title)."""
        self.albums[release_id] = []
        for track_id, name in tracks:
            track = {"id": track_id, "name": name, "artist_ids": ["A"]}
            self.albums[release_id].append(track)
            self.catalogue[f"spotify:track:{track_id}"] = {
                "uri": f"spotify:track:{track_id}",
                "name": name,
                "artists": [{"id": a} for a in track["artist_ids"]],
                "album": {"album_type": release_type},
            }
        return {"spotify_id": release_id, "release_type": release_type}

    def put(self, *track_ids, playlist="pl"):
        self.playlists.setdefault(playlist, []).extend(f"spotify:track:{t}" for t in track_ids)

    def user_removes(self, *track_ids, playlist="pl"):
        for track_id in track_ids:
            self.playlists[playlist].remove(f"spotify:track:{track_id}")

    def tracks(self, playlist="pl"):
        return [uri.rsplit(":", 1)[1] for uri in self.playlists.get(playlist, [])]

    async def get_album_tracks(self, release_id):
        return self.albums[release_id]

    def playlist_items(self, playlist_id, **kwargs):
        return {"items": [{"item": self.catalogue[uri]} for uri in self.playlists.get(playlist_id, [])], "next": None}

    def playlist_add_items(self, playlist_id, uris):
        self.add_calls += 1
        if self.add_calls == self.fail_add_on_call:
            raise RuntimeError("add failed")
        self.playlists.setdefault(playlist_id, []).extend(uris)

    def playlist_remove_all_occurrences_of_items(self, playlist_id, uris):
        self.playlists[playlist_id] = [u for u in self.playlists[playlist_id] if u not in uris]


@pytest.fixture
def spotify(monkeypatch, session_factory):
    fake = FakeSpotify()
    monkeypatch.setattr(account, "user_client", lambda: fake)
    monkeypatch.setattr(account, "SpotifyService", lambda: fake)
    return fake


def sync(*releases, playlist="pl"):
    notifier = account.SpotifyPlaylistSync(playlist, {"album", "single"})
    return asyncio.run(notifier.send_release_notification("A", list(releases)))


def test_removed_track_is_not_readded(spotify):
    release = spotify.release("r", "album", ("t", "Song"))
    assert sync(release)
    spotify.user_removes("t")

    assert sync(release)
    assert spotify.tracks() == []
    assert spotify.add_calls == 1


def test_removed_track_is_not_readded_from_another_release(spotify):
    sync(spotify.release("r1", "single", ("t", "Song")))
    spotify.user_removes("t")

    sync(spotify.release("r2", "album", ("t", "Song"), ("n", "New")))
    assert spotify.tracks() == ["n"]


def test_album_still_replaces_single_in_playlist(spotify):
    sync(spotify.release("single", "single", ("s", "Hit")))

    sync(spotify.release("album", "album", ("a", "Hit")))
    assert spotify.tracks() == ["a"]


def test_track_already_in_playlist_is_not_readded_after_removal(spotify):
    release = spotify.release("old", "album", ("mine", "Old"))
    spotify.put("mine")
    sync(spotify.release("r", "album", ("t", "Song")))
    spotify.user_removes("mine")

    sync(release)
    assert spotify.tracks() == ["t"]


def test_other_tracks_are_still_added_after_a_removal(spotify):
    sync(spotify.release("single", "single", ("s", "Hit")))
    spotify.user_removes("s")

    # Only the exact track is blocked: the album's copy has its own id.
    sync(spotify.release("album", "album", ("a", "Hit"), ("n", "New")))
    assert spotify.tracks() == ["a", "n"]


def test_history_is_per_playlist(spotify):
    release = spotify.release("r", "album", ("t", "Song"))
    sync(release)
    spotify.user_removes("t")

    sync(release, playlist="other")
    assert spotify.tracks("other") == ["t"]
    sync(release)
    assert spotify.tracks() == []


def test_repeat_syncs_do_not_grow_history(spotify, db):
    from app.models import PlaylistTrack

    release = spotify.release("r", "album", ("t", "Song"))
    for _ in range(3):
        sync(release)
    assert db.query(PlaylistTrack).count() == 1


def test_failed_add_is_not_remembered(spotify):
    release = spotify.release("r", "album", ("t", "Song"))
    spotify.fail_add_on_call = 1
    assert sync(release) is False
    assert spotify.tracks() == []

    assert sync(release)
    assert spotify.tracks() == ["t"]


def test_partial_add_remembers_only_the_batches_that_landed(spotify):
    release = spotify.release("r", "album", *[(f"t{i}", f"Song {i}") for i in range(120)])
    spotify.fail_add_on_call = 2
    assert sync(release) is False
    landed = spotify.tracks()
    assert landed == [f"t{i}" for i in range(50)]
    spotify.user_removes(*landed)

    assert sync(release)
    assert spotify.tracks() == [f"t{i}" for i in range(50, 120)]


def test_failed_album_add_keeps_the_single(spotify):
    sync(spotify.release("single", "single", ("s", "Hit")))
    album = spotify.release("album", "album", ("a", "Hit"))
    spotify.fail_add_on_call = 2
    assert sync(album) is False
    assert spotify.tracks() == ["s"]

    assert sync(album)
    assert spotify.tracks() == ["a"]
