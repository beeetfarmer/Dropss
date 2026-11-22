from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from ..database import Base


class PlaylistTrack(Base):
    """A track seen in, or added to, a synced playlist. Kept after the track leaves
    the playlist, so a track the user removed is not added again.
    """
    __tablename__ = "playlist_tracks"

    # Not unique on (playlist_id, track_uri): overlapping syncs may both record
    # a track, which is harmless and must not fail the sync.
    id = Column(Integer, primary_key=True)
    playlist_id = Column(String, nullable=False, index=True)
    track_uri = Column(String, nullable=False)
    added_at = Column(DateTime, default=datetime.utcnow, nullable=False)
