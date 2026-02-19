"""
Pydantic schemas for Artist API requests and responses.
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List


class ArtistSearch(BaseModel):
    """Schema for Spotify artist search results."""

    spotify_id: str
    name: str
    spotify_url: str
    image_url: Optional[str] = None
    followers: Optional[int] = None
    genres: Optional[List[str]] = []


class ArtistCreate(BaseModel):
    """Schema for creating a new followed artist."""

    spotify_id: str
    name: str
    spotify_url: str
    image_url: Optional[str] = None


class ArtistResponse(BaseModel):
    """Schema for artist response with all details."""

    id: int
    spotify_id: str
    name: str
    spotify_url: str
    image_url: Optional[str] = None
    added_at: datetime
    last_checked: Optional[datetime] = None

    class Config:
        from_attributes = True
