import json
import os
from pathlib import Path

DEFAULT_OVERRIDES_FILE = Path(__file__).resolve().parents[2] / "settings_overrides.json"
SECRET_OVERRIDE_FIELDS = {
    "spotify_client_secret", "gotify_token", "ntfy_password",
    "lastfm_api_key", "jellyfin_api_key", "plex_token",
    "navidrome_password",
}


def get_overrides_file() -> Path:
    configured = os.getenv("SETTINGS_OVERRIDES_FILE", "").strip()
    if configured:
        return Path(configured)
    return DEFAULT_OVERRIDES_FILE


def load_overrides() -> dict:
    overrides_file = get_overrides_file()
    if overrides_file.exists():
        try:
            data = json.loads(overrides_file.read_text())
            if isinstance(data, dict):
                removed = False
                for key in SECRET_OVERRIDE_FIELDS:
                    if key in data:
                        del data[key]
                        removed = True
                if removed:
                    save_overrides(data)
            return data if isinstance(data, dict) else {}
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def save_overrides(overrides: dict):
    overrides_file = get_overrides_file()
    overrides_file.parent.mkdir(parents=True, exist_ok=True)
    overrides_file.write_text(json.dumps(overrides, indent=2))
    try:
        overrides_file.chmod(0o600)
    except OSError:
        pass
