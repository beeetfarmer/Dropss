import asyncio
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime
from zoneinfo import ZoneInfo

from .database import SessionLocal
from .models import Artist, Release
from .services.spotify_service import SpotifyService
from .services.gotify_service import GotifyService
from .services.ntfy_service import NtfyService
from .services.telegram_service import TelegramService
from .config import get_settings

scheduler = BackgroundScheduler()
logger = logging.getLogger(__name__)


async def check_for_new_releases():
    logger.info("[%s] Starting daily release check", datetime.now())

    from .config import get_settings
    current_settings = get_settings()

    db = SessionLocal()
    try:
        artists = db.query(Artist).all()

        if not artists:
            logger.info("No artists to check")
            return

        spotify = SpotifyService()

        gotify = None
        ntfy = None
        telegram = None
        if current_settings.gotify_url and current_settings.gotify_token:
            gotify = GotifyService()
        if current_settings.ntfy_url and current_settings.ntfy_topic:
            ntfy = NtfyService()
        if current_settings.telegram_bot_token and current_settings.telegram_chat_id:
            telegram = TelegramService()

        total_new = 0

        for artist in artists:
            # Pace the sweep so paging every artist's discography doesn't burst
            # past Spotify's rolling rate-limit window.
            # ponytail: fixed 1s/artist; switch to Retry-After-aware backoff if still throttled
            await asyncio.sleep(1)
            try:
                logger.info("Checking releases for %s", artist.name)

                releases_data = await spotify.get_artist_releases(
                    artist.spotify_id,
                    current_settings.release_months_back
                )

                new_releases = []

                for release_data in releases_data:
                    existing = db.query(Release).filter(
                        Release.spotify_id == release_data['spotify_id']
                    ).first()

                    if not existing:
                        new_release = Release(
                            spotify_id=release_data['spotify_id'],
                            name=release_data['name'],
                            release_type=release_data['release_type'],
                            release_date=release_data['release_date'],
                            spotify_url=release_data['spotify_url'],
                            image_url=release_data['image_url'],
                            total_tracks=release_data['total_tracks'],
                            artist_id=artist.id,
                            is_new=True,
                            notified=False
                        )
                        db.add(new_release)
                        db.flush()
                        new_releases.append(release_data)
                        total_new += 1

                artist.last_checked = datetime.utcnow()

                db.commit()

                if new_releases:
                    logger.info("Found %d new release(s) for %s", len(new_releases), artist.name)

                    if gotify:
                        await gotify.send_release_notification(
                            artist.name,
                            new_releases
                        )
                    if ntfy:
                        await ntfy.send_release_notification(
                            artist.name,
                            new_releases
                        )
                    if telegram:
                        await telegram.send_release_notification(
                            artist.name,
                            new_releases
                        )

                    for release_data in new_releases:
                        release = db.query(Release).filter(
                            Release.spotify_id == release_data['spotify_id']
                        ).first()
                        if release:
                            release.notified = True
                    db.commit()

            except Exception as e:
                logger.exception("Error checking %s: %s", artist.name, e)
                db.rollback()

        logger.info("Release check complete. Found %d new release(s) total", total_new)

    except Exception as e:
        logger.exception("Error during release check: %s", e)
        db.rollback()

    finally:
        db.close()


def run_sync_check():
    import asyncio

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(check_for_new_releases())
    finally:
        loop.close()


def start_scheduler():
    settings = get_settings()

    try:
        hour, minute = map(int, settings.release_check_time.split(':'))
    except:
        hour, minute = 9, 0

    try:
        tz = ZoneInfo(settings.timezone)
    except Exception:
        logger.warning("Invalid timezone '%s', falling back to UTC", settings.timezone)
        tz = ZoneInfo("UTC")

    scheduler.add_job(
        run_sync_check,
        trigger=CronTrigger(hour=hour, minute=minute, timezone=tz),
        id='daily_release_check',
        name='Check for new releases',
        replace_existing=True
    )

    if not scheduler.running:
        scheduler.start()
    logger.info("Scheduler configured to run daily at %02d:%02d %s", hour, minute, settings.timezone)


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped")
