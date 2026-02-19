import logging
import httpx
from typing import Dict, List, Optional
from difflib import SequenceMatcher
from ..config import get_settings
from ..security import validate_outbound_url

logger = logging.getLogger(__name__)


class PlexService:
    def __init__(self):
        settings = get_settings()
        self.base_url = settings.plex_url.rstrip('/')
        if self.base_url:
            validate_outbound_url(self.base_url, "plex_url")
        self.token = settings.plex_token
        self.headers = {
            "X-Plex-Token": self.token,
            "Accept": "application/json"
        }

    def _similarity_ratio(self, str1: str, str2: str) -> float:
        return SequenceMatcher(None, str1.lower(), str2.lower()).ratio()

    async def get_music_libraries(self) -> List[Dict]:
        if not self.base_url or not self.token:
            return []

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/library/sections",
                    headers=self.headers
                )
                response.raise_for_status()
                data = response.json()

                music_libraries = []
                for section in data.get("MediaContainer", {}).get("Directory", []):
                    if section.get("type") == "artist":
                        music_libraries.append({
                            "key": section.get("key"),
                            "title": section.get("title")
                        })

                return music_libraries

            except Exception as e:
                logger.warning("Error fetching Plex music libraries: %s", e)
                return []

    async def search_artist_in_library(self, library_key: str, artist_name: str) -> Optional[Dict]:
        if not self.base_url or not self.token:
            return None

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/library/sections/{library_key}/all",
                    headers=self.headers,
                    params={"type": 8}
                )
                response.raise_for_status()
                data = response.json()

                artists = data.get("MediaContainer", {}).get("Metadata", [])

                for artist in artists:
                    if artist.get("title", "").lower() == artist_name.lower():
                        return artist

                best_match = None
                best_ratio = 0.0
                for artist in artists:
                    ratio = self._similarity_ratio(artist.get("title", ""), artist_name)
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best_match = artist

                if best_ratio >= 0.85:
                    return best_match

                return None

            except Exception as e:
                logger.warning("Error searching artist in Plex library %s: %s", library_key, e)
                return None

    async def get_artist_albums(self, library_key: str, artist_name: str) -> List[Dict]:
        if not self.base_url or not self.token:
            return []

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/library/sections/{library_key}/all",
                    headers=self.headers,
                    params={"type": 9}
                )
                response.raise_for_status()
                data = response.json()

                all_albums = data.get("MediaContainer", {}).get("Metadata", [])

                artist_albums = []
                artist_name_lower = artist_name.lower()

                for album in all_albums:
                    album_artist = album.get("parentTitle", "").lower()

                    if album_artist == artist_name_lower:
                        artist_albums.append(album)
                    elif self._similarity_ratio(album_artist, artist_name) >= 0.85:
                        artist_albums.append(album)

                return artist_albums

            except Exception as e:
                logger.warning("Error fetching albums for artist %s: %s", artist_name, e)
                return []

    async def get_album_tracks(self, album_key: str) -> List[Dict]:
        if not self.base_url or not self.token:
            return []

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                response = await client.get(
                    f"{self.base_url}{album_key}",
                    headers=self.headers
                )
                response.raise_for_status()
                data = response.json()

                tracks = data.get("MediaContainer", {}).get("Metadata", [])
                return tracks

            except Exception as e:
                logger.warning("Error fetching tracks for album %s: %s", album_key, e)
                return []

    async def check_album_in_library(
        self,
        album_name: str,
        artist_name: str,
        spotify_tracks: List[Dict]
    ) -> Dict:
        logger.info("Checking Plex for %s by %s", album_name, artist_name)

        music_libraries = await self.get_music_libraries()

        if not music_libraries:
            logger.info("No music libraries found in Plex")
            return {
                "in_library": False,
                "match_type": "none",
                "match_confidence": 0.0,
                "available_tracks": [],
                "missing_tracks": [track["name"] for track in spotify_tracks],
                "plex_album_id": None
            }

        logger.info("Found %d music library(ies) in Plex", len(music_libraries))

        for library in music_libraries:
            logger.info("Searching in Plex library: %s", library["title"])

            artist = await self.search_artist_in_library(library["key"], artist_name)

            if not artist:
                logger.info("Artist not found in %s", library["title"])
                continue

            logger.info("Found artist in Plex: %s", artist.get("title"))

            albums = await self.get_artist_albums(library["key"], artist_name)

            if not albums:
                logger.info("No albums found in Plex for artist %s", artist_name)
                continue

            logger.info("Found %d album(s) in Plex for %s", len(albums), artist_name)

            exact_matches = []
            for album in albums:
                if album.get("title", "").lower() == album_name.lower():
                    exact_matches.append(album)

            matched_album = None
            if exact_matches:
                if len(exact_matches) == 1:
                    matched_album = exact_matches[0]
                    logger.info("Exact Plex match found: %s", matched_album.get("title"))
                else:
                    logger.info("Found %d albums with title %s", len(exact_matches), album_name)
                    spotify_track_count = len(spotify_tracks)

                    best_album = None
                    best_track_diff = float('inf')

                    for album in exact_matches:
                        album_tracks = await self.get_album_tracks(album.get("key"))
                        album_track_count = len(album_tracks)
                        track_diff = abs(album_track_count - spotify_track_count)
                        logger.info(
                            "Candidate %s has %d tracks (diff %d)",
                            album.get("title"),
                            album_track_count,
                            track_diff,
                        )

                        if track_diff < best_track_diff:
                            best_track_diff = track_diff
                            best_album = album

                    matched_album = best_album
                    actual_count = len(await self.get_album_tracks(matched_album.get("key")))
                    logger.info(
                        "Selected Plex album with %d tracks (closest to Spotify %d)",
                        actual_count,
                        spotify_track_count,
                    )

            if not matched_album:
                best_match = None
                best_ratio = 0.0
                similarity_threshold = 0.80

                for album in albums:
                    ratio = self._similarity_ratio(album.get("title", ""), album_name)
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best_match = album

                if best_ratio >= similarity_threshold:
                    matched_album = best_match
                    logger.info("Similar Plex match found: %s (%.2f%%)", matched_album.get("title"), best_ratio * 100)

            if not matched_album:
                logger.info("No Plex match found for %s by %s", album_name, artist_name)
                continue

            plex_tracks = await self.get_album_tracks(matched_album.get("key"))
            plex_track_names = {track.get("title", "").lower() for track in plex_tracks}

            logger.info("Plex matched album has %d track(s)", len(plex_tracks))

            available_tracks = []
            missing_tracks = []

            for spotify_track in spotify_tracks:
                track_name = spotify_track["name"]
                if track_name.lower() in plex_track_names:
                    available_tracks.append(track_name)
                else:
                    found = False
                    for plex_track_name in plex_track_names:
                        if self._similarity_ratio(track_name, plex_track_name) >= 0.9:
                            available_tracks.append(track_name)
                            found = True
                            break
                    if not found:
                        missing_tracks.append(track_name)

            logger.info("Matched %d/%d tracks in Plex", len(available_tracks), len(spotify_tracks))
            if missing_tracks:
                logger.info("Missing tracks in Plex: %s", missing_tracks)

            is_exact_match = len(exact_matches) > 0
            match_confidence = 1.0 if is_exact_match else best_ratio if 'best_ratio' in locals() else 1.0

            return {
                "in_library": True,
                "match_type": "exact" if is_exact_match else "similar",
                "match_confidence": match_confidence,
                "available_tracks": available_tracks,
                "missing_tracks": missing_tracks,
                "plex_album_id": matched_album.get("ratingKey"),
                "plex_album_name": matched_album.get("title")
            }

        logger.info("Album not found in any Plex library")
        return {
            "in_library": False,
            "match_type": "none",
            "match_confidence": 0.0,
            "available_tracks": [],
            "missing_tracks": [track["name"] for track in spotify_tracks],
            "plex_album_id": None
        }
