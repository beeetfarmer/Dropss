from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, JSON, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class Release(Base):
    __tablename__ = "releases"

    id = Column(Integer, primary_key=True, index=True)
    spotify_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    release_type = Column(String, nullable=False)
    release_date = Column(String, nullable=False)
    spotify_url = Column(String, nullable=False)
    image_url = Column(String, nullable=True)
    total_tracks = Column(Integer, default=0)

    artist_id = Column(Integer, ForeignKey("artists.id"), nullable=False)

    is_new = Column(Boolean, default=True)
    notified = Column(Boolean, default=False)
    discovered_at = Column(DateTime, default=datetime.utcnow)

    in_jellyfin = Column(Boolean, default=None, nullable=True)
    jellyfin_match_type = Column(String, nullable=True)
    jellyfin_match_confidence = Column(Float, nullable=True)
    jellyfin_album_id = Column(String, nullable=True)

    in_plex = Column(Boolean, default=None, nullable=True)
    plex_match_type = Column(String, nullable=True)
    plex_match_confidence = Column(Float, nullable=True)
    plex_album_id = Column(String, nullable=True)

    tracks = Column(JSON, nullable=True)
    available_tracks = Column(JSON, nullable=True)
    missing_tracks = Column(JSON, nullable=True)
    plex_available_tracks = Column(JSON, nullable=True)
    plex_missing_tracks = Column(JSON, nullable=True)

    in_navidrome = Column(Boolean, default=None, nullable=True)
    navidrome_match_type = Column(String, nullable=True)
    navidrome_match_confidence = Column(Float, nullable=True)
    navidrome_album_id = Column(String, nullable=True)
    navidrome_available_tracks = Column(JSON, nullable=True)
    navidrome_missing_tracks = Column(JSON, nullable=True)

    artist = relationship("Artist", back_populates="releases")

    def __repr__(self):
        return f"<Release {self.name} by {self.artist.name if self.artist else 'Unknown'}>"
