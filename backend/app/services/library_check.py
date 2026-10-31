"""Unattended version of the "Check Jellyfin/Plex/Navidrome" buttons."""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable

from sqlalchemy.orm import Session, joinedload

from ..config import Settings, get_settings
from ..models import Release
from .jellyfin_service import JellyfinService
from .navidrome_service import NavidromeService
from .plex_service import PlexService
from .spotify_service import SpotifyService

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Library:
    key: str
    service: type
    configured: Callable[[Settings], bool]
    available_field: str
    missing_field: str


LIBRARIES = (
    Library("jellyfin", JellyfinService, lambda s: bool(s.jellyfin_url and s.jellyfin_api_key),
            "available_tracks", "missing_tracks"),
    Library("plex", PlexService, lambda s: bool(s.plex_url and s.plex_token),
            "plex_available_tracks", "plex_missing_tracks"),
    Library("navidrome", NavidromeService,
            lambda s: bool(s.navidrome_url and s.navidrome_username and s.navidrome_password),
            "navidrome_available_tracks", "navidrome_missing_tracks"),
)


def _is_complete(library: Library, release: Release) -> bool:
    return getattr(release, f"in_{library.key}") is True and not getattr(release, library.missing_field)


def _apply_status(library: Library, release: Release, status: dict):
    setattr(release, f"in_{library.key}", status["in_library"])
    setattr(release, f"{library.key}_match_type", status["match_type"])
    setattr(release, f"{library.key}_match_confidence", status["match_confidence"])
    setattr(release, f"{library.key}_album_id", status.get(f"{library.key}_album_id"))
    setattr(release, library.available_field, status["available_tracks"])
    setattr(release, library.missing_field, status["missing_tracks"])


async def check_libraries(db: Session):
    settings = get_settings()
    libraries = [(library, library.service()) for library in LIBRARIES if library.configured(settings)]
    if not libraries:
        logger.info("No media libraries configured; skipping library check")
        return

    cutoff = datetime.now() - timedelta(days=settings.release_months_back * 30)
    releases = (
        db.query(Release)
        .options(joinedload(Release.artist))
        .filter(Release.release_date >= cutoff.strftime('%Y-%m-%d'))
        .all()
    )

    spotify = SpotifyService()
    checked = 0
    failed = 0

    for release in releases:
        pending = [(library, client) for library, client in libraries if not _is_complete(library, release)]
        if not pending:
            continue

        tracks = release.tracks
        if not tracks:
            # Same pacing as the release check. get_album_tracks returns [] on
            # any failure, so a Spotify rate limit costs up to 90s per release.
            # ponytail: no early stop; raise from get_album_tracks if that adds up.
            await asyncio.sleep(1)
            tracks = await spotify.get_album_tracks(release.spotify_id)
            if not tracks:
                # Checking against no tracks would overwrite a good result.
                failed += 1
                continue
            release.tracks = tracks

        for library, client in pending:
            try:
                status = await client.check_album_in_library(release.name, release.artist.name, tracks)
                _apply_status(library, release, status)
                db.commit()
                checked += 1
            except Exception as e:
                # Type only: these errors can include URLs carrying credentials.
                logger.warning("%s check failed for release %s: %s", library.key, release.id, type(e).__name__)
                db.rollback()
                failed += 1

    logger.info("Library check complete: %d checked, %d failed", checked, failed)
