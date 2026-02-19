from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class Artist(Base):
    __tablename__ = "artists"

    id = Column(Integer, primary_key=True, index=True)
    spotify_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    spotify_url = Column(String, nullable=False)
    image_url = Column(String, nullable=True)
    added_at = Column(DateTime, default=datetime.utcnow)
    last_checked = Column(DateTime, nullable=True)

    releases = relationship("Release", back_populates="artist", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Artist {self.name} ({self.spotify_id})>"
