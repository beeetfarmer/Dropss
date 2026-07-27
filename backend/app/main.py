import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .database import init_db
from .logging_config import setup_logging
from .routes import artists_router, releases_router
from .routes.integrations import router as integrations_router
from .routes.settings import router as settings_router
from .routes.auth import router as auth_router
from .scheduler import start_scheduler, stop_scheduler
from .security import verify_csrf_request


settings = get_settings()
setup_logging(settings.log_level, settings.app_env)
logger = logging.getLogger(__name__)
docs_enabled = settings.expose_docs and settings.app_env.lower().strip() != "production"


def validate_runtime_security_settings():
    env = settings.app_env.lower().strip()
    if env == "production" and not settings.auth_enabled:
        raise RuntimeError("AUTH_ENABLED must be true in production")


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_runtime_security_settings()
    logger.info("Starting Dropss")
    init_db()
    logger.info("Database initialized")
    start_scheduler()
    logger.info("Scheduler started")

    yield

    logger.info("Stopping scheduler")
    stop_scheduler()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Dropss",
    description="Track your favorite Spotify artists and get notified of new releases",
    version="0.2.1",
    lifespan=lifespan,
    docs_url="/docs" if docs_enabled else None,
    redoc_url="/redoc" if docs_enabled else None,
    openapi_url="/openapi.json" if docs_enabled else None,
)

cors_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-API-Key", "X-CSRF-Token"],
)


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.url.path != "/auth/login":
        try:
            verify_csrf_request(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


app.include_router(auth_router)
app.include_router(artists_router)
app.include_router(releases_router)
app.include_router(integrations_router)
app.include_router(settings_router)


@app.get("/")
async def root():
    payload = {
        "message": "Dropss API",
        "version": "0.2.1",
        "health": "/health"
    }
    if docs_enabled:
        payload["docs"] = "/docs"
    return payload


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "dropss"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8619, reload=True)
