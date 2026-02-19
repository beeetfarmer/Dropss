from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional, Dict, Any

from ..database import get_db
from ..models import Release, Artist
from ..schemas.release import ReleaseResponse
from ..services.spotify_service import SpotifyService
from ..rate_limit import rate_limit
from ..security import require_authenticated_request, require_write_request

router = APIRouter(
    prefix="/releases",
    tags=["releases"],
    dependencies=[Depends(require_authenticated_request)],
)


@router.get("/", response_model=List[ReleaseResponse])
async def get_all_releases(
    only_new: bool = Query(False, description="Show only new releases"),
    artist_id: Optional[int] = Query(None, description="Filter by artist ID"),
    limit: int = Query(200, ge=1, le=500, description="Max releases to return"),
    offset: int = Query(0, ge=0, description="Records to skip"),
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit(max_requests=120, window_seconds=60)),
):
    query = db.query(Release).options(joinedload(Release.artist))

    if only_new:
        query = query.filter(Release.is_new == True)

    if artist_id:
        query = query.filter(Release.artist_id == artist_id)

    releases = query.order_by(Release.release_date.desc()).offset(offset).limit(limit).all()

    response_data = []
    for release in releases:
        release_dict = ReleaseResponse.model_validate(release)
        release_dict.artist_name = release.artist.name if release.artist else None
        response_data.append(release_dict)

    return response_data


@router.get("/latest", response_model=List[ReleaseResponse])
async def get_latest_releases(
    limit: int = Query(100, ge=1, le=300, description="Number of releases to return"),
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit(max_requests=120, window_seconds=60)),
):
    from datetime import datetime, timedelta
    from ..config import get_settings

    settings = get_settings()

    cutoff_date = datetime.now() - timedelta(days=settings.release_months_back * 30)
    cutoff_date_str = cutoff_date.strftime('%Y-%m-%d')

    query = (
        db.query(Release)
        .options(joinedload(Release.artist))
        .filter(Release.release_date >= cutoff_date_str)
        .order_by(Release.release_date.desc())
    )

    query = query.limit(limit)

    releases = query.all()

    response_data = []
    for release in releases:
        release_dict = ReleaseResponse.model_validate(release)
        release_dict.artist_name = release.artist.name if release.artist else None
        response_data.append(release_dict)

    return response_data


@router.post("/{release_id}/mark-seen")
async def mark_release_as_seen(
    release_id: int,
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=30, window_seconds=60)),
):
    release = db.query(Release).filter(Release.id == release_id).first()

    if not release:
        return {"error": "Release not found"}

    release.is_new = False
    db.commit()

    return {"message": "Release marked as seen"}


@router.post("/mark-all-seen")
async def mark_all_releases_as_seen(
    db: Session = Depends(get_db),
    __: None = Depends(require_write_request),
    _: None = Depends(rate_limit(max_requests=10, window_seconds=60)),
):
    count = db.query(Release).filter(Release.is_new == True).update({"is_new": False})
    db.commit()

    return {"message": f"Marked {count} releases as seen"}


@router.get("/stats")
async def get_release_stats(
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit(max_requests=120, window_seconds=60)),
):
    from datetime import datetime, timedelta
    from ..config import get_settings

    settings = get_settings()

    cutoff_date = datetime.now() - timedelta(days=settings.release_months_back * 30)
    cutoff_date_str = cutoff_date.strftime('%Y-%m-%d')

    total_releases = db.query(Release).filter(Release.release_date >= cutoff_date_str).count()
    new_releases = db.query(Release).filter(Release.is_new == True, Release.release_date >= cutoff_date_str).count()
    total_artists = db.query(Artist).count()

    albums = db.query(Release).filter(Release.release_type == "album", Release.release_date >= cutoff_date_str).count()
    singles = db.query(Release).filter(Release.release_type == "single", Release.release_date >= cutoff_date_str).count()
    eps = db.query(Release).filter(Release.release_type == "ep", Release.release_date >= cutoff_date_str).count()

    return {
        "total_releases": total_releases,
        "new_releases": new_releases,
        "total_artists": total_artists,
        "by_type": {
            "albums": albums,
            "singles": singles,
            "eps": eps
        }
    }


@router.get("/{release_id}/tracks", response_model=List[Dict[str, Any]])
async def get_release_tracks(
    release_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(rate_limit(max_requests=60, window_seconds=60)),
):
    release = db.query(Release).filter(Release.id == release_id).first()

    if not release:
        return {"error": "Release not found"}

    if release.tracks:
        return release.tracks

    spotify = SpotifyService()
    tracks = await spotify.get_album_tracks(release.spotify_id)

    release.tracks = tracks
    db.commit()

    return tracks
