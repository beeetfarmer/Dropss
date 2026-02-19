"""
Last.fm API integration service.
Fetches user's top artists for automatic following.
"""
import httpx
import logging
from typing import List, Dict
from ..config import get_settings

logger = logging.getLogger(__name__)


class LastFmService:
    """Service for interacting with Last.fm API."""

    BASE_URL = "https://ws.audioscrobbler.com/2.0/"

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.lastfm_api_key
        self.username = settings.lastfm_username

    async def get_top_artists(self, period: str = "overall", limit: int = 50) -> List[Dict]:
        """
        Fetch user's top artists from Last.fm.

        Args:
            period: Time period - "7day", "1month", "3month", "6month", "12month", or "overall"
            limit: Number of artists to return (max 1000)

        Returns:
            List of artist dictionaries with name and playcount
        """
        if not self.api_key or not self.username:
            logger.warning("Last.fm credentials missing")
            raise ValueError("Last.fm API key and username must be configured")

        async with httpx.AsyncClient() as client:
            params = {
                "method": "user.gettopartists",
                "user": self.username,
                "api_key": self.api_key,
                "format": "json",
                "period": period,
                "limit": limit
            }

            try:
                response = await client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()

                if "error" in data:
                    error_msg = data.get('message', 'Unknown error')
                    error_code = data.get('error', 'Unknown code')
                    logger.warning("Last.fm API returned error code %s", error_code)
                    raise ValueError(f"Last.fm API error: {error_msg}")

                artists_data = data.get("topartists", {}).get("artist", [])
                logger.info("Fetched %d artists from Last.fm", len(artists_data))

                artists = []
                for artist_data in artists_data:
                    artists.append({
                        "name": artist_data["name"],
                        "playcount": int(artist_data["playcount"]),
                        "mbid": artist_data.get("mbid", "")
                    })

                return artists

            except httpx.HTTPStatusError as e:
                logger.warning("HTTP error from Last.fm: %s", e)
                raise
            except Exception as e:
                logger.warning("Unexpected Last.fm error: %s", e)
                raise
