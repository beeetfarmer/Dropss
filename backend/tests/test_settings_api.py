from unittest.mock import patch


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


def test_scheduler_restarts_only_for_schedule_changes(client):
    with patch("app.scheduler.start_scheduler") as restart:
        client.put("/settings/", json={"hide_seen_releases": True})
        restart.assert_not_called()

        client.put("/settings/", json={"release_check_time": "07:20"})
        restart.assert_called_once()
