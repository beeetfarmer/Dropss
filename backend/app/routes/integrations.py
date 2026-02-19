import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Dict
from pydantic import BaseModel, Field
import httpx

from ..database import get_db
from ..anomaly import record_anomaly_event
from ..models import Artist, Release
from ..services.lastfm_service import LastFmService
from ..services.jellyfin_service import JellyfinService
from ..services.plex_service import PlexService
from ..services.navidrome_service import NavidromeService
from ..services.spotify_service import SpotifyService
from ..services.gotify_service import GotifyService
from ..services.ntfy_service import NtfyService
from ..config import get_settings
from ..rate_limit import rate_limit
from ..security import get_rate_limit_identity, require_authenticated_request, require_write_request

router = APIRouter(
    prefix="/integrations",
    tags=["integrations"],
    dependencies=[Depends(require_authenticated_request)],
)
logger = logging.getLogger(__name__)


@router.get("/status")
async def check_integration_status(_: None = Depends(rate_limit(max_requests=30, window_seconds=60))):
    settings = get_settings()
    jellyfin_available = False
    plex_available = False
    navidrome_available = False
    gotify_configured = False
    ntfy_configured = False
    errors = {}

    try:
        jellyfin = JellyfinService()
        if jellyfin.base_url and jellyfin.api_key:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{jellyfin.base_url}/System/Info",
                    headers=jellyfin.headers
                )
                if response.status_code == 200:
                    jellyfin_available = True
    except Exception:
        errors["jellyfin"] = "unavailable"

    try:
        plex = PlexService()
        if plex.base_url and plex.token:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{plex.base_url}/",
                    headers=plex.headers
                )
                if response.status_code == 200:
                    plex_available = True
    except Exception:
        errors["plex"] = "unavailable"

    try:
        navidrome = NavidromeService()
        if navidrome.base_url and navidrome.username and navidrome.password:
            navidrome_available = await navidrome.ping()
    except Exception:
        errors["navidrome"] = "unavailable"

    gotify_configured = bool(settings.gotify_url and settings.gotify_token)

    ntfy_configured = bool(settings.ntfy_url and settings.ntfy_topic)

    spotify_configured = bool(settings.spotify_client_id and settings.spotify_client_secret)

    lastfm_configured = bool(settings.lastfm_api_key and settings.lastfm_username)

    return {
        "jellyfin_available": jellyfin_available,
        "plex_available": plex_available,
        "navidrome_available": navidrome_available,
        "gotify_configured": gotify_configured,
        "ntfy_configured": ntfy_configured,
        "spotify_configured": spotify_configured,
        "lastfm_configured": lastfm_configured,
        "errors": errors
    }


@router.post("/gotify/test")
async def test_gotify_connection(
    request: Request,
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=5, window_seconds=60)),
):
    settings = get_settings()

    if not settings.gotify_url or not settings.gotify_token:
        raise HTTPException(
            status_code=400,
            detail="Gotify is not configured. Please set GOTIFY_URL and GOTIFY_TOKEN."
        )

    try:
        identity = get_rate_limit_identity(request)
        record_anomaly_event(
            category="notification_test_calls",
            key=identity,
            threshold=8,
            window_seconds=600,
            logger=logger,
            details={"endpoint": "/integrations/gotify/test"},
        )
        gotify = GotifyService()
        success = await gotify.test_connection()

        if success:
            return {"success": True, "message": "Gotify test notification sent successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send Gotify notification")

    except Exception:
        raise HTTPException(status_code=500, detail="Gotify test failed")


@router.post("/ntfy/test")
async def test_ntfy_connection(
    request: Request,
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=5, window_seconds=60)),
):
    settings = get_settings()

    if not settings.ntfy_url or not settings.ntfy_topic:
        raise HTTPException(
            status_code=400,
            detail="Ntfy is not configured. Please set NTFY_URL and NTFY_TOPIC."
        )

    try:
        identity = get_rate_limit_identity(request)
        record_anomaly_event(
            category="notification_test_calls",
            key=identity,
            threshold=8,
            window_seconds=600,
            logger=logger,
            details={"endpoint": "/integrations/ntfy/test"},
        )
        ntfy = NtfyService()
        success = await ntfy.test_connection()

        if success:
            return {"success": True, "message": "Ntfy test notification sent successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send ntfy notification")

    except Exception:
        raise HTTPException(status_code=500, detail="Ntfy test failed")


class LastFmImportRequest(BaseModel):
    period: str = "overall"
    limit: int = Field(default=50, ge=1, le=200)


class LastFmImportResponse(BaseModel):
    total_artists: int
    new_artists: int
    existing_artists: int
    artists_added: List[str]


class JellyfinCheckResponse(BaseModel):
    release_id: int
    in_library: bool
    match_type: str
    match_confidence: float
    available_tracks: List[str]
    missing_tracks: List[str]


class PlexCheckResponse(BaseModel):
    release_id: int
    in_library: bool
    match_type: str
    match_confidence: float
    available_tracks: List[str]
    missing_tracks: List[str]


class NavidromeCheckResponse(BaseModel):
    release_id: int
    in_library: bool
    match_type: str
    match_confidence: float
    available_tracks: List[str]
    missing_tracks: List[str]


@router.post("/lastfm/import", response_model=LastFmImportResponse)
async def import_lastfm_artists(
    request: LastFmImportRequest,
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=5, window_seconds=60)),
):
    try:
        lastfm = LastFmService()
        spotify = SpotifyService()

        lastfm_artists = await lastfm.get_top_artists(request.period, request.limit)
        logger.info("Processing %d artists from Last.fm", len(lastfm_artists))

        new_count = 0
        existing_count = 0
        artists_added = []
        skipped = []

        for idx, lastfm_artist in enumerate(lastfm_artists, 1):
            artist_name = lastfm_artist["name"]
            logger.info("[%d/%d] Processing artist %s", idx, len(lastfm_artists), artist_name)

            try:
                existing = db.query(Artist).filter(Artist.name.ilike(artist_name)).first()

                if existing:
                    logger.info("Already following by name: %s", artist_name)
                    existing_count += 1
                    continue

                spotify_results = await spotify.search_artists(artist_name, limit=1)

                if not spotify_results:
                    logger.info("Not found on Spotify: %s", artist_name)
                    skipped.append(artist_name)
                    continue

                spotify_artist = spotify_results[0]
                logger.info("Found on Spotify: %s", spotify_artist.name)

                existing_by_id = db.query(Artist).filter(
                    Artist.spotify_id == spotify_artist.spotify_id
                ).first()

                if existing_by_id:
                    logger.info("Already following as %s (same Spotify ID)", existing_by_id.name)
                    existing_count += 1
                    continue

                new_artist = Artist(
                    spotify_id=spotify_artist.spotify_id,
                    name=spotify_artist.name,
                    spotify_url=spotify_artist.spotify_url,
                    image_url=spotify_artist.image_url
                )

                db.add(new_artist)
                db.flush()
                artists_added.append(spotify_artist.name)
                new_count += 1

            except Exception as e:
                logger.warning("Error processing artist %s: %s", artist_name, e)
                skipped.append(artist_name)
                continue

        logger.info("Committing %d new artists to database", new_count)
        db.commit()
        logger.info(
            "Last.fm import complete. New=%d Existing=%d Skipped=%d",
            new_count,
            existing_count,
            len(skipped),
        )

        return LastFmImportResponse(
            total_artists=len(lastfm_artists),
            new_artists=new_count,
            existing_artists=existing_count,
            artists_added=artists_added
        )

    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to import Last.fm artists")


@router.post("/jellyfin/check/{release_id}", response_model=JellyfinCheckResponse)
async def check_jellyfin_library(
    release_id: int,
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
):
    release = db.query(Release).filter(Release.id == release_id).first()

    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    try:
        jellyfin = JellyfinService()
        spotify = SpotifyService()

        spotify_tracks = await spotify.get_album_tracks(release.spotify_id)

        jellyfin_status = await jellyfin.check_album_in_library(
            release.name,
            release.artist.name,
            spotify_tracks
        )

        release.in_jellyfin = jellyfin_status["in_library"]
        release.jellyfin_match_type = jellyfin_status["match_type"]
        release.jellyfin_match_confidence = jellyfin_status["match_confidence"]
        release.jellyfin_album_id = jellyfin_status.get("jellyfin_album_id")
        release.tracks = spotify_tracks
        release.available_tracks = jellyfin_status["available_tracks"]
        release.missing_tracks = jellyfin_status["missing_tracks"]

        db.commit()

        return JellyfinCheckResponse(
            release_id=release.id,
            in_library=jellyfin_status["in_library"],
            match_type=jellyfin_status["match_type"],
            match_confidence=jellyfin_status["match_confidence"],
            available_tracks=jellyfin_status["available_tracks"],
            missing_tracks=jellyfin_status["missing_tracks"]
        )

    except Exception:
        raise HTTPException(status_code=500, detail="Failed to check Jellyfin library")


@router.post("/jellyfin/check-all")
async def check_all_jellyfin(
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=3, window_seconds=60)),
):
    releases = db.query(Release).all()

    jellyfin = JellyfinService()
    spotify = SpotifyService()

    checked_count = 0
    in_library_count = 0
    errors = []

    for release in releases:
        try:
            spotify_tracks = await spotify.get_album_tracks(release.spotify_id)

            jellyfin_status = await jellyfin.check_album_in_library(
                release.name,
                release.artist.name,
                spotify_tracks
            )

            release.in_jellyfin = jellyfin_status["in_library"]
            release.jellyfin_match_type = jellyfin_status["match_type"]
            release.jellyfin_match_confidence = jellyfin_status["match_confidence"]
            release.jellyfin_album_id = jellyfin_status.get("jellyfin_album_id")
            release.tracks = spotify_tracks
            release.available_tracks = jellyfin_status["available_tracks"]
            release.missing_tracks = jellyfin_status["missing_tracks"]

            if jellyfin_status["in_library"]:
                in_library_count += 1

            checked_count += 1

        except Exception:
            errors.append(f"Error checking {release.name}")

    db.commit()

    return {
        "total_releases": len(releases),
        "checked": checked_count,
        "in_library": in_library_count,
        "not_in_library": checked_count - in_library_count,
        "errors": errors
    }


@router.post("/plex/check/{release_id}", response_model=PlexCheckResponse)
async def check_plex_library(
    release_id: int,
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
):
    release = db.query(Release).filter(Release.id == release_id).first()

    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    try:
        plex = PlexService()
        spotify = SpotifyService()

        spotify_tracks = await spotify.get_album_tracks(release.spotify_id)

        plex_status = await plex.check_album_in_library(
            release.name,
            release.artist.name,
            spotify_tracks
        )

        release.in_plex = plex_status["in_library"]
        release.plex_match_type = plex_status["match_type"]
        release.plex_match_confidence = plex_status["match_confidence"]
        release.plex_album_id = plex_status.get("plex_album_id")
        release.tracks = spotify_tracks
        release.plex_available_tracks = plex_status["available_tracks"]
        release.plex_missing_tracks = plex_status["missing_tracks"]

        db.commit()

        return PlexCheckResponse(
            release_id=release.id,
            in_library=plex_status["in_library"],
            match_type=plex_status["match_type"],
            match_confidence=plex_status["match_confidence"],
            available_tracks=plex_status["available_tracks"],
            missing_tracks=plex_status["missing_tracks"]
        )

    except Exception:
        raise HTTPException(status_code=500, detail="Failed to check Plex library")


@router.post("/plex/check-all")
async def check_all_plex(
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=3, window_seconds=60)),
):
    releases = db.query(Release).all()

    plex = PlexService()
    spotify = SpotifyService()

    checked_count = 0
    in_library_count = 0
    errors = []

    for release in releases:
        try:
            spotify_tracks = await spotify.get_album_tracks(release.spotify_id)

            plex_status = await plex.check_album_in_library(
                release.name,
                release.artist.name,
                spotify_tracks
            )

            release.in_plex = plex_status["in_library"]
            release.plex_match_type = plex_status["match_type"]
            release.plex_match_confidence = plex_status["match_confidence"]
            release.plex_album_id = plex_status.get("plex_album_id")
            release.tracks = spotify_tracks
            release.plex_available_tracks = plex_status["available_tracks"]
            release.plex_missing_tracks = plex_status["missing_tracks"]

            if plex_status["in_library"]:
                in_library_count += 1

            checked_count += 1

        except Exception:
            errors.append(f"Error checking {release.name}")

    db.commit()

    return {
        "total_releases": len(releases),
        "checked": checked_count,
        "in_library": in_library_count,
        "not_in_library": checked_count - in_library_count,
        "errors": errors
    }


@router.post("/navidrome/check/{release_id}", response_model=NavidromeCheckResponse)
async def check_navidrome_library(
    release_id: int,
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
):
    release = db.query(Release).filter(Release.id == release_id).first()

    if not release:
        raise HTTPException(status_code=404, detail="Release not found")

    try:
        navidrome = NavidromeService()
        spotify = SpotifyService()

        spotify_tracks = await spotify.get_album_tracks(release.spotify_id)

        navidrome_status = await navidrome.check_album_in_library(
            release.name,
            release.artist.name,
            spotify_tracks
        )

        release.in_navidrome = navidrome_status["in_library"]
        release.navidrome_match_type = navidrome_status["match_type"]
        release.navidrome_match_confidence = navidrome_status["match_confidence"]
        release.navidrome_album_id = navidrome_status.get("navidrome_album_id")
        release.tracks = spotify_tracks
        release.navidrome_available_tracks = navidrome_status["available_tracks"]
        release.navidrome_missing_tracks = navidrome_status["missing_tracks"]

        db.commit()

        return NavidromeCheckResponse(
            release_id=release.id,
            in_library=navidrome_status["in_library"],
            match_type=navidrome_status["match_type"],
            match_confidence=navidrome_status["match_confidence"],
            available_tracks=navidrome_status["available_tracks"],
            missing_tracks=navidrome_status["missing_tracks"]
        )

    except Exception:
        raise HTTPException(status_code=500, detail="Failed to check Navidrome library")


@router.post("/navidrome/check-all")
async def check_all_navidrome(
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=3, window_seconds=60)),
):
    releases = db.query(Release).all()

    navidrome = NavidromeService()
    spotify = SpotifyService()

    checked_count = 0
    in_library_count = 0
    errors = []

    for release in releases:
        try:
            spotify_tracks = await spotify.get_album_tracks(release.spotify_id)

            navidrome_status = await navidrome.check_album_in_library(
                release.name,
                release.artist.name,
                spotify_tracks
            )

            release.in_navidrome = navidrome_status["in_library"]
            release.navidrome_match_type = navidrome_status["match_type"]
            release.navidrome_match_confidence = navidrome_status["match_confidence"]
            release.navidrome_album_id = navidrome_status.get("navidrome_album_id")
            release.tracks = spotify_tracks
            release.navidrome_available_tracks = navidrome_status["available_tracks"]
            release.navidrome_missing_tracks = navidrome_status["missing_tracks"]

            if navidrome_status["in_library"]:
                in_library_count += 1

            checked_count += 1

        except Exception:
            errors.append(f"Error checking {release.name}")

    db.commit()

    return {
        "total_releases": len(releases),
        "checked": checked_count,
        "in_library": in_library_count,
        "not_in_library": checked_count - in_library_count,
        "errors": errors
    }
