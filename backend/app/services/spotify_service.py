import asyncio
import logging
import spotipy
from spotipy.cache_handler import CacheFileHandler
from spotipy.oauth2 import SpotifyClientCredentials, SpotifyOauthError
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from ..config import get_settings
from ..schemas.artist import ArtistSearch

logger = logging.getLogger(__name__)


class SpotifyServiceError(Exception):
    """Raised when Spotify rejects a request, so callers can distinguish an
    upstream failure from a genuinely empty result set."""

    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _describe_spotify_error(exc: Exception) -> SpotifyServiceError:
    if isinstance(exc, SpotifyOauthError):
        return SpotifyServiceError(
            "Spotify authentication failed. Check SPOTIFY_CLIENT_ID and "
            "SPOTIFY_CLIENT_SECRET, then restart the backend.",
            status_code=502,
        )

    if isinstance(exc, spotipy.SpotifyException):
        # spotipy prefixes msg with the full request URL; keep only the reason.
        upstream = (exc.msg or "").split("\n")[-1].strip() or "Spotify rejected the request."
        if exc.http_status == 429:
            return SpotifyServiceError("Spotify rate limit reached. Try again shortly.", 503)
        if exc.http_status in (401, 403):
            return SpotifyServiceError(f"Spotify denied the request: {upstream}", 502)
        return SpotifyServiceError(f"Spotify error ({exc.http_status}): {upstream}", 502)

    return SpotifyServiceError(f"Could not reach Spotify: {exc}", 502)


class SpotifyService:
    def __init__(self):
        settings = get_settings()
        cache_handler = CacheFileHandler(cache_path="/tmp/spotipy.cache")
        auth_manager = SpotifyClientCredentials(
            client_id=settings.spotify_client_id,
            client_secret=settings.spotify_client_secret,
            cache_handler=cache_handler,
        )
        # Keep spotipy's default retry/backoff: Spotify emits short 429s as normal
        # flow control and the default retry absorbs them with a ~1-2s wait. The
        # to_thread wrapping on every call below keeps any backoff off the event
        # loop, so it can no longer freeze the app the way retries=0 was meant to
        # avoid. requests_timeout just caps a genuinely hung socket.
        self.client = spotipy.Spotify(
            auth_manager=auth_manager,
            requests_timeout=10,
        )

    async def search_artists(self, query: str, limit: int = 10) -> List[ArtistSearch]:
        try:
            results = await asyncio.to_thread(
                self.client.search, q=query, type='artist', limit=limit
            )
            artists = []

            for item in results['artists']['items']:
                artist = ArtistSearch(
                    spotify_id=item['id'],
                    name=item['name'],
                    spotify_url=item['external_urls']['spotify'],
                    image_url=item['images'][0]['url'] if item.get('images') else None,
                    followers=item.get('followers', {}).get('total', 0),
                    genres=item.get('genres', [])
                )
                artists.append(artist)

            return artists

        except Exception as e:
            logger.warning("Error searching artists: %s", e)
            raise _describe_spotify_error(e) from e

    async def get_artist_releases(
        self,
        artist_id: str,
        months_back: int = 3
    ) -> List[Dict[str, Any]]:
        try:
            cutoff_date = datetime.now() - timedelta(days=months_back * 30)

            all_releases = []
            results = await asyncio.to_thread(
                self.client.artist_albums,
                artist_id,
                album_type='album,single',
                limit=10,  # Spotify capped list endpoints at 10 (Feb 2026); next() pages the rest
            )

            while results:
                for album in results['items']:
                    album_group = album.get('album_group', '')
                    if album_group == 'compilation' or album_group == 'appears_on':
                        continue

                    release_date_str = album['release_date']

                    try:
                        if len(release_date_str) == 4:
                            release_date = datetime.strptime(release_date_str, '%Y')
                        elif len(release_date_str) == 7:
                            release_date = datetime.strptime(release_date_str, '%Y-%m')
                        else:
                            release_date = datetime.strptime(release_date_str, '%Y-%m-%d')
                    except ValueError:
                        continue

                    if release_date >= cutoff_date:
                        release_data = {
                            'spotify_id': album['id'],
                            'name': album['name'],
                            'release_type': album['album_type'],
                            'release_date': album['release_date'],
                            'spotify_url': album['external_urls']['spotify'],
                            'image_url': album['images'][0]['url'] if album.get('images') else None,
                            'total_tracks': album.get('total_tracks', 0)
                        }
                        all_releases.append(release_data)

                if results['next']:
                    results = await asyncio.to_thread(self.client.next, results)
                else:
                    break

            all_releases.sort(key=lambda x: x['release_date'], reverse=True)

            return all_releases

        except Exception as e:
            # Raise, don't return [], so a 429/upstream failure isn't reported
            # to the user as "0 releases". See SpotifyServiceError docstring.
            logger.warning("Error fetching artist releases: %s", e)
            raise _describe_spotify_error(e) from e

    async def get_artist_info(self, artist_id: str) -> Optional[Dict[str, Any]]:
        try:
            artist = await asyncio.to_thread(self.client.artist, artist_id)
            return {
                'spotify_id': artist['id'],
                'name': artist['name'],
                'spotify_url': artist['external_urls']['spotify'],
                'image_url': artist['images'][0]['url'] if artist.get('images') else None,
                'followers': artist.get('followers', {}).get('total', 0),
                'genres': artist.get('genres', [])
            }
        except Exception as e:
            logger.warning("Error fetching artist info: %s", e)
            raise _describe_spotify_error(e) from e

    async def get_album_tracks(self, album_id: str) -> List[Dict[str, Any]]:
        try:
            results = await asyncio.to_thread(
                self.client.album_tracks, album_id, limit=10
            )  # Feb 2026 cap; next() pages the rest
            tracks = []

            while results:
                for track in results['items']:
                    tracks.append({
                        'id': track['id'],
                        'name': track['name'],
                        'track_number': track['track_number'],
                        'duration_ms': track['duration_ms'],
                        'spotify_url': track['external_urls']['spotify']
                    })

                if results['next']:
                    results = await asyncio.to_thread(self.client.next, results)
                else:
                    break

            return tracks

        except Exception as e:
            logger.warning("Error fetching album tracks: %s", e)
            return []
