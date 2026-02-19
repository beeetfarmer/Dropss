from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String

from ..database import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    key_id = Column(String, unique=True, index=True, nullable=False)
    key_prefix = Column(String, nullable=False)
    key_hash = Column(String, unique=True, nullable=False)
    scopes = Column(String, nullable=False, default="read")
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    def __repr__(self):
        return f"<ApiKey {self.name} ({self.key_id})>"
