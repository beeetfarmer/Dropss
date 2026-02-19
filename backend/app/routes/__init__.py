"""
API routes package.
"""
from .artists import router as artists_router
from .releases import router as releases_router

__all__ = ["artists_router", "releases_router"]
