import os

# Read when app modules are imported, so these have to precede them.
os.environ.setdefault("APP_SECRET_KEY", "test-only-not-a-secret")
os.environ["AUTH_ENABLED"] = "false"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import scheduler
from app.config import get_settings
from app.database import Base, get_db
from app.main import app
from app.rate_limit import _REQUEST_LOG


@pytest.fixture(autouse=True)
def isolated_settings(tmp_path, monkeypatch):
    """Keep every test away from the real settings overrides file."""
    monkeypatch.setenv("SETTINGS_OVERRIDES_FILE", str(tmp_path / "overrides.json"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def session_factory(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    monkeypatch.setattr(scheduler, "SessionLocal", Session)
    return Session


@pytest.fixture
def db(session_factory):
    with session_factory() as session:
        yield session


@pytest.fixture
def client(session_factory):
    def override_get_db():
        with session_factory() as session:
            yield session

    _REQUEST_LOG.clear()
    app.dependency_overrides[get_db] = override_get_db
    # Not used as a context manager: that would run the lifespan and start the scheduler.
    yield TestClient(app)
    app.dependency_overrides.clear()
