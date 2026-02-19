import hashlib
import logging
import secrets
import httpx
from typing import Dict, List, Optional
from difflib import SequenceMatcher
from ..config import get_settings
from ..security import validate_outbound_url

logger = logging.getLogger(__name__)


class NavidromeService:
    def __init__(self):
        settings = get_settings()
        self.base_url = settings.navidrome_url.rstrip('/')
        if self.base_url:
            validate_outbound_url(self.base_url, "navidrome_url")
        self.username = settings.navidrome_username
        self.password = settings.navidrome_password

    def _auth_params(self) -> Dict[str, str]:
        salt = secrets.token_hex(8)
        # nosem: Navidrome/Subsonic protocol requires MD5(password + salt)
        token = hashlib.md5((self.password + salt).encode()).hexdigest()
        return {
            "u": self.username,
            "t": token,
            "s": salt,
            "v": "1.16.1",
            "c": "Dropss",
            "f": "json",
        }

    def _similarity_ratio(self, str1: str, str2: str) -> float:
        return SequenceMatcher(None, str1.lower(), str2.lower()).ratio()

    async def ping(self) -> bool:
        if not self.base_url or not self.username or not self.password:
            return False

        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/rest/ping.view",
                    params=self._auth_params(),
                )
                response.raise_for_status()
                data = response.json()
                status = data.get("subsonic-response", {}).get("status")
                return status == "ok"
            except Exception as e:
                logger.warning("Error pinging Navidrome: %s", e)
                return False

    async def search_artist(self, artist_name: str) -> Optional[Dict]:
        if not self.base_url or not self.username or not self.password:
            return None

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                params = self._auth_params()
                params["query"] = artist_name
                params["artistCount"] = "20"
                params["albumCount"] = "0"
                params["songCount"] = "0"

                response = await client.get(
                    f"{self.base_url}/rest/search3.view",
                    params=params,
                )
                response.raise_for_status()
                data = response.json()

                search_result = data.get("subsonic-response", {}).get("searchResult3", {})
                artists = search_result.get("artist", [])

                if not artists:
                    return None

                for artist in artists:
                    if artist.get("name", "").lower() == artist_name.lower():
                        return artist

                best_match = None
                best_ratio = 0.0
                for artist in artists:
                    ratio = self._similarity_ratio(artist.get("name", ""), artist_name)
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best_match = artist

                if best_ratio >= 0.85:
                    return best_match

                return None

            except Exception as e:
                logger.warning("Error searching artist in Navidrome: %s", e)
                return None

    async def get_artist_albums(self, artist_id: str) -> List[Dict]:
        if not self.base_url or not self.username or not self.password:
            return []

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                params = self._auth_params()
                params["id"] = artist_id

                response = await client.get(
                    f"{self.base_url}/rest/getArtist.view",
                    params=params,
                )
                response.raise_for_status()
                data = response.json()

                artist_data = data.get("subsonic-response", {}).get("artist", {})
                albums = artist_data.get("album", [])
                return albums

            except Exception as e:
                logger.warning("Error fetching Navidrome albums for %s: %s", artist_id, e)
                return []

    async def get_album_tracks(self, album_id: str) -> List[Dict]:
        if not self.base_url or not self.username or not self.password:
            return []

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                params = self._auth_params()
                params["id"] = album_id

                response = await client.get(
                    f"{self.base_url}/rest/getAlbum.view",
                    params=params,
                )
                response.raise_for_status()
                data = response.json()

                album_data = data.get("subsonic-response", {}).get("album", {})
                tracks = album_data.get("song", [])
                return tracks

            except Exception as e:
                logger.warning("Error fetching Navidrome tracks for album %s: %s", album_id, e)
                return []

    async def check_album_in_library(
        self,
        album_name: str,
        artist_name: str,
        spotify_tracks: List[Dict],
    ) -> Dict:
        logger.info("Checking Navidrome for %s by %s", album_name, artist_name)

        artist = await self.search_artist(artist_name)

        if not artist:
            logger.info("Artist not found in Navidrome: %s", artist_name)
            return {
                "in_library": False,
                "match_type": "none",
                "match_confidence": 0.0,
                "available_tracks": [],
                "missing_tracks": [track["name"] for track in spotify_tracks],
                "navidrome_album_id": None,
            }

        logger.info("Found Navidrome artist %s (id=%s)", artist.get("name"), artist.get("id"))

        albums = await self.get_artist_albums(artist["id"])

        if not albums:
            logger.info("No albums found for artist in Navidrome")
            return {
                "in_library": False,
                "match_type": "none",
                "match_confidence": 0.0,
                "available_tracks": [],
                "missing_tracks": [track["name"] for track in spotify_tracks],
                "navidrome_album_id": None,
            }

        logger.info("Found %d album(s) in Navidrome", len(albums))

        exact_match = None
        for album in albums:
            if album.get("name", "").lower() == album_name.lower():
                exact_match = album
                break

        best_match = None
        best_ratio = 0.0
        similarity_threshold = 0.85

        if not exact_match:
            for album in albums:
                ratio = self._similarity_ratio(album.get("name", ""), album_name)
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_match = album

        matched_album = exact_match or (best_match if best_ratio >= similarity_threshold else None)

        if not matched_album:
            logger.info("No Navidrome match found. Best similarity=%.2f%%", best_ratio * 100)
            return {
                "in_library": False,
                "match_type": "none",
                "match_confidence": best_ratio,
                "available_tracks": [],
                "missing_tracks": [track["name"] for track in spotify_tracks],
                "navidrome_album_id": None,
            }

        if exact_match:
            logger.info("Exact Navidrome match found: %s", matched_album.get("name"))
        else:
            logger.info("Similar Navidrome match found: %s (%.2f%%)", matched_album.get("name"), best_ratio * 100)

        nd_tracks = await self.get_album_tracks(matched_album["id"])
        nd_track_names = {track.get("title", "").lower() for track in nd_tracks}

        logger.info("Navidrome matched album has %d track(s)", len(nd_tracks))

        available_tracks = []
        missing_tracks = []

        for spotify_track in spotify_tracks:
            track_name = spotify_track["name"]
            if track_name.lower() in nd_track_names:
                available_tracks.append(track_name)
            else:
                found = False
                for nd_track_name in nd_track_names:
                    if self._similarity_ratio(track_name, nd_track_name) >= 0.9:
                        available_tracks.append(track_name)
                        found = True
                        break
                if not found:
                    missing_tracks.append(track_name)

        logger.info("Matched %d/%d tracks in Navidrome", len(available_tracks), len(spotify_tracks))
        if missing_tracks:
            logger.info("Missing tracks in Navidrome: %s", missing_tracks)

        return {
            "in_library": True,
            "match_type": "exact" if exact_match else "similar",
            "match_confidence": 1.0 if exact_match else best_ratio,
            "available_tracks": available_tracks,
            "missing_tracks": missing_tracks,
            "navidrome_album_id": matched_album.get("id"),
            "navidrome_album_name": matched_album.get("name"),
        }
