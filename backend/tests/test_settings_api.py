from unittest.mock import patch

import pytest


def test_hide_seen_defaults_to_off_and_round_trips(client):
    assert client.get("/settings/").json()["hide_seen_releases"] is False

    for value in (True, False):
        response = client.put("/settings/", json={"hide_seen_releases": value})
        assert response.json()["updated_fields"] == ["hide_seen_releases"]
        assert client.get("/settings/").json()["hide_seen_releases"] is value


def test_settings_report_the_app_version(client):
    from app.config import APP_VERSION

    assert client.get("/settings/").json()["app_version"] == APP_VERSION


def test_secret_fields_cannot_be_set_through_the_api(client):
    response = client.put("/settings/", json={"gotify_token": "secret"})

    assert response.status_code == 400
    assert "gotify_token" in response.json()["detail"]


def test_blank_value_clears_an_override(client):
    client.put("/settings/", json={"lastfm_username": "someone"})
    assert client.get("/settings/").json()["lastfm_username"] == "someone"

    client.put("/settings/", json={"lastfm_username": ""})

    assert client.get("/settings/").json()["lastfm_username"] == ""


def test_library_check_time_is_off_by_default_and_round_trips(client):
    assert client.get("/settings/").json()["library_check_time"] == ""

    with patch("app.scheduler.start_scheduler") as restart:
        client.put("/settings/", json={"library_check_time": "03:30"})
        assert client.get("/settings/").json()["library_check_time"] == "03:30"

        client.put("/settings/", json={"library_check_time": ""})
        assert client.get("/settings/").json()["library_check_time"] == ""

    assert restart.call_count == 2


@pytest.mark.parametrize("field", ["library_check_time", "release_check_time"])
@pytest.mark.parametrize("value", ["nonsense", "25:00", "12:60", "3pm"])
def test_invalid_times_are_rejected_and_not_saved(client, field, value):
    before = client.get("/settings/").json()[field]

    response = client.put("/settings/", json={field: value})

    assert response.status_code == 400
    assert field in response.json()["detail"]
    assert client.get("/settings/").json()[field] == before


def test_scheduler_restarts_only_for_schedule_changes(client):
    with patch("app.scheduler.start_scheduler") as restart:
        client.put("/settings/", json={"hide_seen_releases": True})
        restart.assert_not_called()

        client.put("/settings/", json={"release_check_time": "07:20"})
        restart.assert_called_once()
