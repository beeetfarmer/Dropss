import logging
import httpx
from typing import Dict, List, Optional
from difflib import SequenceMatcher
from ..config import get_settings
from ..security import validate_outbound_url

logger = logging.getLogger(__name__)


class JellyfinService:
    def __init__(self):
        settings = get_settings()
        self.base_url = settings.jellyfin_url.rstrip('/')
        if self.base_url:
            validate_outbound_url(self.base_url, "jellyfin_url")
        self.api_key = settings.jellyfin_api_key
        self.headers = {
            "X-Emby-Token": self.api_key
        }

    def _similarity_ratio(self, str1: str, str2: str) -> float:
        return SequenceMatcher(None, str1.lower(), str2.lower()).ratio()

    async def get_artist_items(self, artist_name: str) -> List[Dict]:
        if not self.base_url or not self.api_key:
            return []

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                users_response = await client.get(
                    f"{self.base_url}/Users",
                    headers=self.headers
                )
                users_response.raise_for_status()
                users = users_response.json()

                if not users:
                    logger.info("No users found in Jellyfin")
                    return []

                user_id = users[0]["Id"]

                search_params = {
                    "searchTerm": artist_name,
                    "IncludeItemTypes": "MusicArtist",
                    "Recursive": "true",
                    "Limit": 50
                }

                response = await client.get(
                    f"{self.base_url}/Users/{user_id}/Items",
                    headers=self.headers,
                    params=search_params
                )
                response.raise_for_status()
                data = response.json()

                artists = data.get("Items", [])
                if not artists:
                    return []

                artist_id = artists[0]["Id"]

                album_params = {
                    "ArtistIds": artist_id,
                    "IncludeItemTypes": "MusicAlbum",
                    "Recursive": "true",
                    "Fields": "Path,MediaStreams",
                    "Limit": 500
                }

                album_response = await client.get(
                    f"{self.base_url}/Users/{user_id}/Items",
                    headers=self.headers,
                    params=album_params
                )
                album_response.raise_for_status()
                album_data = album_response.json()

                return album_data.get("Items", [])

            except Exception as e:
                logger.warning("Error fetching Jellyfin data for %s: %s", artist_name, e)
                return []

    async def get_album_tracks(self, album_id: str) -> List[Dict]:
        if not self.base_url or not self.api_key:
            return []

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                users_response = await client.get(
                    f"{self.base_url}/Users",
                    headers=self.headers
                )
                users_response.raise_for_status()
                users = users_response.json()

                if not users:
                    return []

                user_id = users[0]["Id"]

                params = {
                    "ParentId": album_id,
                    "SortBy": "SortName"
                }

                response = await client.get(
                    f"{self.base_url}/Users/{user_id}/Items",
                    headers=self.headers,
                    params=params
                )
                response.raise_for_status()
                data = response.json()
                return data.get("Items", [])

            except Exception as e:
                logger.warning("Error fetching tracks for album %s: %s", album_id, e)
                return []

    async def check_album_in_library(
        self,
        album_name: str,
        artist_name: str,
        spotify_tracks: List[Dict]
    ) -> Dict:
        logger.info("Checking Jellyfin for %s by %s", album_name, artist_name)
        jellyfin_albums = await self.get_artist_items(artist_name)

        if not jellyfin_albums:
            logger.info("No albums found for artist %s in Jellyfin", artist_name)
            return {
                "in_library": False,
                "match_type": "none",
                "match_confidence": 0.0,
                "available_tracks": [],
                "missing_tracks": [track["name"] for track in spotify_tracks],
                "jellyfin_album_id": None
            }

        logger.info("Found %d albums in Jellyfin for %s", len(jellyfin_albums), artist_name)

        exact_match = None
        for jf_album in jellyfin_albums:
            if jf_album["Name"].lower() == album_name.lower():
                exact_match = jf_album
                break

        best_match = None
        best_ratio = 0.0
        similarity_threshold = 0.85

        if not exact_match:
            for jf_album in jellyfin_albums:
                ratio = self._similarity_ratio(jf_album["Name"], album_name)
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_match = jf_album

        matched_album = exact_match or (best_match if best_ratio >= similarity_threshold else None)

        if not matched_album:
            logger.info("No Jellyfin match found. Best similarity=%.2f%%", best_ratio * 100)
            return {
                "in_library": False,
                "match_type": "none",
                "match_confidence": best_ratio,
                "available_tracks": [],
                "missing_tracks": [track["name"] for track in spotify_tracks],
                "jellyfin_album_id": None
            }

        if exact_match:
            logger.info("Exact Jellyfin match found: %s", matched_album["Name"])
        else:
            logger.info("Similar Jellyfin match found: %s (%.2f%%)", matched_album["Name"], best_ratio * 100)

        jf_tracks = await self.get_album_tracks(matched_album["Id"])
        jf_track_names = {track["Name"].lower() for track in jf_tracks}

        available_tracks = []
        missing_tracks = []

        for spotify_track in spotify_tracks:
            track_name = spotify_track["name"]
            if track_name.lower() in jf_track_names:
                available_tracks.append(track_name)
            else:
                found = False
                for jf_track_name in jf_track_names:
                    if self._similarity_ratio(track_name, jf_track_name) >= 0.9:
                        available_tracks.append(track_name)
                        found = True
                        break
                if not found:
                    missing_tracks.append(track_name)

        return {
            "in_library": True,
            "match_type": "exact" if exact_match else "similar",
            "match_confidence": 1.0 if exact_match else best_ratio,
            "available_tracks": available_tracks,
            "missing_tracks": missing_tracks,
            "jellyfin_album_id": matched_album["Id"],
            "jellyfin_album_name": matched_album["Name"]
        }
