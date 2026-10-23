import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
import httpx


@pytest.fixture
def mock_geocoding_response():
    return {
        "results": [
            {
                "id": 1275339,
                "name": "Mumbai",
                "latitude": 19.07283,
                "longitude": 72.88261,
                "country": "India",
                "admin1": "Maharashtra",
                "timezone": "Asia/Kolkata",
            },
            {
                "id": 1273294,
                "name": "Delhi",
                "latitude": 28.65195,
                "longitude": 77.23149,
                "country": "India",
                "admin1": "Delhi",
                "timezone": "Asia/Kolkata",
            },
        ]
    }


@pytest.fixture
def mock_forecast_response():
    return {
        "latitude": 19.07,
        "longitude": 72.88,
        "timezone": "Asia/Kolkata",
        "hourly_units": {
            "time": "iso8601",
            "temperature_2m": "°C",
            "precipitation_probability": "%",
            "precipitation": "mm",
            "rain": "mm",
            "weather_code": "wmo code",
            "wind_speed_10m": "km/h",
        },
        "hourly": {
            "time": ["2026-10-23T10:00", "2026-10-23T11:00", "2026-10-23T12:00"],
            "temperature_2m": [28.5, 29.0, 29.2],
            "precipitation_probability": [80, 85, 90],
            "precipitation": [2.5, 4.0, 3.2],
            "rain": [2.5, 4.0, 3.2],
            "weather_code": [63, 65, 65],
            "wind_speed_10m": [15.2, 18.0, 16.5],
        },
    }


def test_locations_search_success(client: TestClient, mock_geocoding_response):
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_geocoding_response
        mock_get.return_value = mock_resp

        response = client.get("/api/locations/search?q=Mumbai")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Mumbai"
        assert data[0]["country"] == "India"
        assert data[0]["latitude"] == 19.07283


def test_locations_search_short_query(client: TestClient):
    response = client.get("/api/locations/search?q=a")
    assert response.status_code == 422  # validation min_length=2


def test_locations_search_rate_limited(client: TestClient):
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = AsyncMock()
        mock_resp.status_code = 429
        mock_get.return_value = mock_resp

        response = client.get("/api/locations/search?q=NewYorkCity")
        assert response.status_code == 429
        assert "rate limit exceeded" in response.json()["detail"].lower()


def test_locations_search_timeout(client: TestClient):
    with patch("httpx.AsyncClient.get", side_effect=httpx.TimeoutException("Timeout")):
        response = client.get("/api/locations/search?q=Bangalore")
        assert response.status_code == 504
        assert "timed out" in response.json()["detail"].lower()


def test_weather_forecast_success(client: TestClient, mock_forecast_response):
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = mock_forecast_response
        mock_get.return_value = mock_resp

        response = client.get("/api/weather/forecast?latitude=19.07&longitude=72.88&timezone=Asia/Kolkata")
        assert response.status_code == 200
        data = response.json()
        assert data["latitude"] == 19.07
        assert data["attribution"] == "Weather forecast data: Open-Meteo.com"
        assert data["attribution_url"] == "https://open-meteo.com/"
        assert len(data["hourly"]["precipitation_probability"]) == 3
        assert data["hourly"]["precipitation_probability"][1] == 85


def test_weather_forecast_invalid_coordinates(client: TestClient):
    # Invalid latitude > 90
    response = client.get("/api/weather/forecast?latitude=95.0&longitude=72.88")
    assert response.status_code == 422

    # Invalid longitude < -180
    response = client.get("/api/weather/forecast?latitude=19.0&longitude=-195.0")
    assert response.status_code == 422


def test_weather_forecast_upstream_error(client: TestClient):
    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"
        mock_get.return_value = mock_resp

        response = client.get("/api/weather/forecast?latitude=10.0&longitude=20.0")
        assert response.status_code == 502
        assert "upstream" in response.json()["detail"].lower()
