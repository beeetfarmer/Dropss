from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from ..database import get_db
from ..models import Artist
from ..schemas.artist import ArtistCreate, ArtistResponse, ArtistSearch
from ..services.spotify_service import SpotifyService
from ..rate_limit import rate_limit
from ..security import require_authenticated_request, require_write_request

router = APIRouter(
    prefix="/artists",
    tags=["artists"],
    dependencies=[Depends(require_authenticated_request)],
)


@router.get("/search", response_model=List[ArtistSearch])
async def search_artists(
    query: str = Query(..., min_length=1, description="Search query for artists"),
    limit: int = Query(10, ge=1, le=50, description="Number of results to return"),
    _: None = Depends(rate_limit(max_requests=60, window_seconds=60)),
):
    spotify = SpotifyService()
    results = await spotify.search_artists(query, limit)
    return results


@router.post("/follow", response_model=ArtistResponse)
async def follow_artist(
    artist_data: ArtistCreate,
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
):
    existing = db.query(Artist).filter(Artist.spotify_id == artist_data.spotify_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Artist is already being followed")

    new_artist = Artist(
        spotify_id=artist_data.spotify_id,
        name=artist_data.name,
        spotify_url=artist_data.spotify_url,
        image_url=artist_data.image_url
    )

    db.add(new_artist)
    db.commit()
    db.refresh(new_artist)

    return new_artist


@router.get("/followed", response_model=List[ArtistResponse])
async def get_followed_artists(
    limit: int = Query(200, ge=1, le=500, description="Max artists to return"),
    offset: int = Query(0, ge=0, description="Records to skip"),
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit(max_requests=120, window_seconds=60)),
):
    artists = db.query(Artist).order_by(Artist.name).offset(offset).limit(limit).all()
    return artists


@router.delete("/{artist_id}")
async def unfollow_artist(
    artist_id: int,
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
):
    artist = db.query(Artist).filter(Artist.id == artist_id).first()

    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")

    db.delete(artist)
    db.commit()

    return {"message": f"Unfollowed {artist.name}"}


@router.post("/{artist_id}/refresh")
async def refresh_artist_releases(
    artist_id: int,
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=10, window_seconds=60)),
):
    from ..models import Release
    from ..config import get_settings
    from ..services.gotify_service import GotifyService
    from ..services.ntfy_service import NtfyService

    settings = get_settings()

    artist = db.query(Artist).filter(Artist.id == artist_id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")

    spotify = SpotifyService()

    artist_info = await spotify.get_artist_info(artist.spotify_id)
    if artist_info and artist_info.get('image_url'):
        artist.image_url = artist_info['image_url']
        db.flush()

    releases_data = await spotify.get_artist_releases(
        artist.spotify_id,
        settings.release_months_back
    )

    new_count = 0
    new_releases = []

    for release_data in releases_data:
        existing = db.query(Release).filter(
            Release.spotify_id == release_data['spotify_id']
        ).first()

        if not existing:
            new_release = Release(
                spotify_id=release_data['spotify_id'],
                name=release_data['name'],
                release_type=release_data['release_type'],
                release_date=release_data['release_date'],
                spotify_url=release_data['spotify_url'],
                image_url=release_data['image_url'],
                total_tracks=release_data['total_tracks'],
                artist_id=artist.id,
                is_new=True,
                notified=False
            )
            db.add(new_release)
            db.flush()
            new_releases.append(release_data)
            new_count += 1

    artist.last_checked = datetime.utcnow()

    if new_releases:
        if settings.gotify_url and settings.gotify_token:
            gotify = GotifyService()
            await gotify.send_release_notification(
                artist.name,
                new_releases
            )
        if settings.ntfy_url and settings.ntfy_topic:
            ntfy = NtfyService()
            await ntfy.send_release_notification(
                artist.name,
                new_releases
            )

        for release_data in new_releases:
            release = db.query(Release).filter(
                Release.spotify_id == release_data['spotify_id']
            ).first()
            if release:
                release.notified = True

    db.commit()

    return {
        "artist": artist.name,
        "new_releases": new_count,
        "total_releases": len(releases_data)
    }


@router.get("/{artist_id}/releases")
async def get_artist_all_releases(
    artist_id: int,
    limit: int = Query(500, ge=1, le=1000, description="Max releases to return"),
    offset: int = Query(0, ge=0, description="Records to skip"),
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit(max_requests=20, window_seconds=60)),
):
    from ..models import Release
    from ..config import get_settings
    from ..schemas.release import ReleaseResponse

    settings = get_settings()

    artist = db.query(Artist).filter(Artist.id == artist_id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")

    spotify = SpotifyService()

    artist_info = await spotify.get_artist_info(artist.spotify_id)
    if artist_info and artist_info.get('image_url'):
        artist.image_url = artist_info['image_url']
        db.flush()

    releases_data = await spotify.get_artist_releases(
        artist.spotify_id,
        months_back=1200
    )

    for release_data in releases_data:
        existing = db.query(Release).filter(
            Release.spotify_id == release_data['spotify_id']
        ).first()

        if not existing:
            new_release = Release(
                spotify_id=release_data['spotify_id'],
                name=release_data['name'],
                release_type=release_data['release_type'],
                release_date=release_data['release_date'],
                spotify_url=release_data['spotify_url'],
                image_url=release_data['image_url'],
                total_tracks=release_data['total_tracks'],
                artist_id=artist.id,
                is_new=False,
                notified=False
            )
            db.add(new_release)
            db.flush()

    db.commit()

    releases = db.query(Release).filter(
        Release.artist_id == artist_id
    ).order_by(Release.release_date.desc()).offset(offset).limit(limit).all()

    from ..schemas.artist import ArtistResponse
    artist_response = ArtistResponse.model_validate(artist)

    releases_response = []
    for release in releases:
        release_dict = ReleaseResponse.model_validate(release)
        release_dict.artist_name = artist.name
        releases_response.append(release_dict)

    return {
        "artist": artist_response,
        "releases": releases_response,
        "release_months_back": settings.release_months_back
    }
