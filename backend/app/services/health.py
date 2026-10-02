"""Per-integration health for the settings page.

Each check answers "is it configured, and does it answer with these credentials?"
without side effects: nothing here sends a notification. Every check returns
"ok", "error" or "unconfigured".
"""
import asyncio
import logging

import apprise
import httpx

from ..config import get_settings
from .gotify_service import GotifyService
from .jellyfin_service import JellyfinService
from .lastfm_service import LastFmService
from .navidrome_service import NavidromeService
from .ntfy_service import NtfyService
from .plex_service import PlexService
from .spotify_service import SpotifyService
from .telegram_service import API_BASE as TELEGRAM_API

logger = logging.getLogger(__name__)
TIMEOUT = 5.0


async def _get_ok(url: str, **kwargs) -> bool:
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False) as client:
        response = await client.get(url, **kwargs)
        return response.status_code == 200


async def _spotify(s) -> bool:
    service = SpotifyService()
    # Client-credentials token exchange: proves the id/secret pair is valid.
    return bool(await asyncio.to_thread(service.client.auth_manager.get_access_token, as_dict=False, check_cache=False))


async def _lastfm(s) -> bool:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.get(LastFmService.BASE_URL, params={
            "method": "user.getinfo", "user": s.lastfm_username,
            "api_key": s.lastfm_api_key, "format": "json",
        })
        return response.status_code == 200 and "error" not in response.json()


async def _jellyfin(s) -> bool:
    jf = JellyfinService()
    return await _get_ok(f"{jf.base_url}/System/Info", headers=jf.headers)


async def _plex(s) -> bool:
    plex = PlexService()
    return await _get_ok(f"{plex.base_url}/", headers=plex.headers)


async def _navidrome(s) -> bool:
    return await NavidromeService().ping()


async def _gotify(s) -> bool:
    # App tokens can't read anything, so this proves reachability only.
    return await _get_ok(f"{GotifyService().base_url}/health")


async def _ntfy(s) -> bool:
    return await _get_ok(f"{NtfyService().base_url}/v1/health")


async def _telegram(s) -> bool:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.get(f"{TELEGRAM_API}/bot{s.telegram_bot_token}/getMe")
        return response.status_code == 200 and response.json().get("ok") is True


async def _apprise(s) -> bool:
    # Apprise has no side-effect-free probe; "ok" means every URL parsed.
    urls = [u for u in s.apprise_urls.replace(",", " ").split() if u]
    return all(apprise.Apprise().add(u) for u in urls)


CHECKS = {
    "spotify": (lambda s: s.spotify_client_id and s.spotify_client_secret, _spotify),
    "lastfm": (lambda s: s.lastfm_api_key and s.lastfm_username, _lastfm),
    "jellyfin": (lambda s: s.jellyfin_url and s.jellyfin_api_key, _jellyfin),
    "plex": (lambda s: s.plex_url and s.plex_token, _plex),
    "navidrome": (lambda s: s.navidrome_url and s.navidrome_username and s.navidrome_password, _navidrome),
    "gotify": (lambda s: s.gotify_url and s.gotify_token, _gotify),
    "ntfy": (lambda s: s.ntfy_url and s.ntfy_topic, _ntfy),
    "telegram": (lambda s: s.telegram_bot_token and s.telegram_chat_id, _telegram),
    "apprise": (lambda s: s.apprise_urls, _apprise),
}


async def _run(name: str, check, settings) -> str:
    try:
        return "ok" if await asyncio.wait_for(check(settings), TIMEOUT + 1) else "error"
    except Exception as e:
        # Type only: exception text can embed URLs carrying tokens (e.g. Telegram).
        logger.info("Health check failed for %s: %s", name, type(e).__name__)
        return "error"


async def integration_health() -> dict[str, str]:
    settings = get_settings()
    names = list(CHECKS)
    results = await asyncio.gather(*(
        _run(name, CHECKS[name][1], settings) if CHECKS[name][0](settings) else asyncio.sleep(0, "unconfigured")
        for name in names
    ))
    return dict(zip(names, results))
