from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text

from ..database import Base


class SpotifyAccount(Base):
    """The single Spotify user account Dropss acts as (for playlist sync).

    token_encrypted holds spotipy's token dict (incl. refresh token),
    Fernet-encrypted with a key derived from APP_SECRET_KEY.
    """
    __tablename__ = "spotify_account"

    id = Column(Integer, primary_key=True)
    spotify_user_id = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    redirect_uri = Column(String, nullable=False)
    token_encrypted = Column(Text, nullable=False)
    connected_at = Column(DateTime, default=datetime.utcnow, nullable=False)
