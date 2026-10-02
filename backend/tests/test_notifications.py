"""Run: python -m tests.test_notifications (from backend/)."""
import asyncio
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from unittest.mock import patch

from app.config import Settings
from app.routes.settings import _mask_secret
from app.services import notifications
from app.services.apprise_service import AppriseService


def test_mask_secret():
    assert _mask_secret("") == ""
    assert _mask_secret("short") == "•" * 12
    assert _mask_secret("a" * 19) == "•" * 12
    long = "0123456789abcdefghijWXYZ"
    assert _mask_secret(long) == "•" * 12 + "WXYZ"
    assert "0123" not in _mask_secret(long)
    assert _mask_secret("discord://12345678901234567890/tokentokentoken") == "•" * 12


def test_apprise_delivers_and_is_registered():
    received = []

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            received.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
            self.send_response(200)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    settings = Settings(apprise_urls=f"json://127.0.0.1:{server.server_port}/hook")

    with patch("app.services.apprise_service.get_settings", return_value=settings), \
         patch("app.services.notifications.get_settings", return_value=settings):
        # Only exercise Apprise: other services may be live-configured via .env.
        notifiers = [n for n in notifications.configured_notifiers() if isinstance(n, AppriseService)]
        assert len(notifiers) == 1
        release = {"name": "Album", "release_type": "album", "release_date": "2026-01-01",
                   "spotify_url": "https://open.spotify.com/album/x"}
        asyncio.run(notifications.notify_new_releases(notifiers, "Artist", [release]))
    server.shutdown()

    assert len(received) == 1
    assert received[0]["title"] == "New Release from Artist"
    assert "Album" in received[0]["message"]


def test_bad_apprise_url_fails_cleanly():
    with patch("app.services.apprise_service.get_settings", return_value=Settings(apprise_urls="nonsense")):
        assert asyncio.run(AppriseService().test_connection()) is False


if __name__ == "__main__":
    test_mask_secret()
    test_apprise_delivers_and_is_registered()
    test_bad_apprise_url_fails_cleanly()
    print("ok")
