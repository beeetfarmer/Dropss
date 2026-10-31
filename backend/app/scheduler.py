import asyncio
import logging
import threading
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime
from zoneinfo import ZoneInfo

from .database import SessionLocal
from .models import Artist, Release
from .services.library_check import check_libraries
from .services.spotify_service import SpotifyRateLimited, SpotifyService
from .services.notifications import configured_notifiers, notify_new_releases
from .config import get_settings

scheduler = BackgroundScheduler()
logger = logging.getLogger(__name__)

# Scheduled and manual checks share this, so they never sweep at the same time.
_check_lock = threading.Lock()
_cancel_requested = threading.Event()
# Only in memory: "finished" stays False after a restart, which is how a run that
# died with the server is told apart from one that ended.
_progress = {"total": 0, "checked": 0, "current": None, "new_releases": 0, "failed": 0, "cancelled": False, "finished": False}


async def check_for_new_releases():
    logger.info("[%s] Starting daily release check", datetime.now())

    from .config import get_settings
    current_settings = get_settings()

    db = SessionLocal()
    try:
        # Stalest first, so a sweep cut short by a rate limit resumes where it stopped.
        artists = db.query(Artist).order_by(Artist.last_checked.asc().nullsfirst()).all()

        if not artists:
            logger.info("No artists to check")
            return

        spotify = SpotifyService()

        notifiers = configured_notifiers()

        _progress["total"] = len(artists)

        for checked, artist in enumerate(artists):
            _progress["current"] = artist.name
            # Pace the sweep so paging every artist's discography doesn't burst
            # past Spotify's rolling rate-limit window.
            # ponytail: fixed 1s/artist; switch to Retry-After-aware backoff if still throttled
            await asyncio.sleep(1)

            # Between artists only, so a cancelled run leaves no half-saved artist.
            if _cancel_requested.is_set():
                _progress["cancelled"] = True
                logger.info("Release check cancelled after %d of %d artists", checked, len(artists))
                break

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

                artist.last_checked = datetime.utcnow()

                db.commit()

                _progress["new_releases"] += len(new_releases)

                if new_releases:
                    logger.info("Found %d new release(s) for %s", len(new_releases), artist.name)

                    await notify_new_releases(notifiers, artist.name, new_releases)

                    for release_data in new_releases:
                        release = db.query(Release).filter(
                            Release.spotify_id == release_data['spotify_id']
                        ).first()
                        if release:
                            release.notified = True
                    db.commit()

            except SpotifyRateLimited:
                logger.warning("Spotify rate limit reached at %s; stopping this release check", artist.name)
                db.rollback()
                _progress["failed"] += len(artists) - checked
                break

            except Exception as e:
                logger.exception("Error checking %s: %s", artist.name, e)
                db.rollback()
                _progress["failed"] += 1

            finally:
                _progress["checked"] = checked + 1

        logger.info("Release check complete. Found %d new release(s) total", _progress["new_releases"])

    except Exception as e:
        logger.exception("Error during release check: %s", e)
        db.rollback()
        _progress["failed"] = max(_progress["failed"], 1)

    finally:
        _progress["current"] = None
        db.close()


def _begin_check() -> bool:
    if not _check_lock.acquire(blocking=False):
        return False
    _cancel_requested.clear()
    _progress.update(total=0, checked=0, current=None, new_releases=0, failed=0, cancelled=False, finished=False)
    return True


def _run_check_and_release():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        loop.run_until_complete(check_for_new_releases())
    finally:
        loop.close()
        _progress["finished"] = True
        _check_lock.release()


def run_sync_check():
    if _begin_check():
        _run_check_and_release()
    else:
        logger.warning("Skipping scheduled release check: one is already running")


def start_manual_check() -> bool:
    """Start a check in the background; False if one is already running."""
    if not _begin_check():
        return False
    threading.Thread(target=_run_check_and_release, daemon=True).start()
    return True


def cancel_check() -> bool:
    """Ask a running check to stop after the current artist; False if none is running."""
    if not _check_lock.locked():
        return False
    _cancel_requested.set()
    return True


def check_status() -> dict:
    running = _check_lock.locked()
    return {"running": running, "cancelling": running and _cancel_requested.is_set(), **_progress}


def run_library_check():
    logger.info("Starting library check")
    with SessionLocal() as db:
        asyncio.run(check_libraries(db))


def _schedule_library_check(check_time: str, tz: ZoneInfo):
    trigger = None
    if check_time:
        try:
            hour, minute = map(int, check_time.split(':'))
            trigger = CronTrigger(hour=hour, minute=minute, timezone=tz)
        except ValueError:
            logger.warning("Invalid library check time '%s'; library check is off", check_time)

    if trigger:
        scheduler.add_job(
            run_library_check,
            trigger=trigger,
            id='daily_library_check',
            name='Check media libraries',
            misfire_grace_time=3600,
            replace_existing=True
        )
    elif scheduler.get_job('daily_library_check'):
        scheduler.remove_job('daily_library_check')


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
        misfire_grace_time=3600,
        replace_existing=True
    )

    _schedule_library_check(settings.library_check_time, tz)

    if not scheduler.running:
        scheduler.start()
    logger.info("Scheduler configured to run daily at %02d:%02d %s", hour, minute, settings.timezone)


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler stopped")
