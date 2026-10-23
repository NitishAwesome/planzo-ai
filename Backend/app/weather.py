import datetime
import logging
import time
from typing import Any
import httpx
from fastapi import APIRouter, HTTPException, Query, status

from .schemas import ForecastResponse, HourlyForecast, HourlyUnits, LocationResult

logger = logging.getLogger("planzo-weather")

router = APIRouter(tags=["weather"])

GEOCODING_API_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_API_URL = "https://api.open-meteo.com/v1/forecast"
HTTP_TIMEOUT_SECONDS = 6.0

# Simple in-memory TTL caching
_search_cache: dict[str, tuple[float, list[LocationResult]]] = {}
_forecast_cache: dict[str, tuple[float, ForecastResponse]] = {}
CACHE_TTL_SEARCH_SECONDS = 600.0  # 10 minutes
CACHE_TTL_FORECAST_SECONDS = 300.0  # 5 minutes


@router.get(
    "/locations/search",
    response_model=list[LocationResult],
    summary="Search geographic locations via Open-Meteo Geocoding",
)
async def search_locations(
    q: str = Query(..., min_length=2, max_length=100, description="City or location query"),
) -> list[LocationResult]:
    query_clean = q.strip().lower()
    if len(query_clean) < 2:
        return []

    now = time.time()
    # Check cache
    if query_clean in _search_cache:
        cached_time, results = _search_cache[query_clean]
        if now - cached_time < CACHE_TTL_SEARCH_SECONDS:
            return results

    params = {
        "name": query_clean,
        "count": 10,
        "language": "en",
        "format": "json",
    }

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            resp = await client.get(GEOCODING_API_URL, params=params)

        if resp.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Open-Meteo rate limit exceeded. Please wait a moment and try again.",
            )

        if resp.status_code != 200:
            logger.error("Open-Meteo geocoding error HTTP %d: %s", resp.status_code, resp.text)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Upstream geocoding service returned an error.",
            )

        data = resp.json()
        raw_results = data.get("results") or []
        results: list[LocationResult] = []

        for item in raw_results:
            try:
                results.append(
                    LocationResult(
                        id=item.get("id", f"{item.get('latitude')}_{item.get('longitude')}"),
                        name=item.get("name", ""),
                        latitude=float(item.get("latitude")),
                        longitude=float(item.get("longitude")),
                        country=item.get("country"),
                        admin1=item.get("admin1"),
                        timezone=item.get("timezone"),
                    )
                )
            except (ValueError, TypeError):
                continue

        _search_cache[query_clean] = (now, results)
        return results

    except httpx.TimeoutException:
        logger.warning("Open-Meteo geocoding request timed out for query '%s'", query_clean)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Geocoding lookup timed out. Please try again.",
        )
    except httpx.RequestError as exc:
        logger.error("Network error during geocoding: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to connect to Open-Meteo geocoding service.",
        )


@router.get(
    "/weather/forecast",
    response_model=ForecastResponse,
    summary="Retrieve hourly forecast from Open-Meteo",
)
async def get_forecast(
    latitude: float = Query(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90"),
    longitude: float = Query(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180"),
    timezone: str = Query("auto", max_length=50, description="Timezone or 'auto'"),
) -> ForecastResponse:
    rounded_lat = round(latitude, 4)
    rounded_lng = round(longitude, 4)
    cache_key = f"{rounded_lat}_{rounded_lng}_{timezone}"

    now = time.time()
    if cache_key in _forecast_cache:
        cached_time, cached_resp = _forecast_cache[cache_key]
        if now - cached_time < CACHE_TTL_FORECAST_SECONDS:
            return cached_resp

    params: dict[str, Any] = {
        "latitude": rounded_lat,
        "longitude": rounded_lng,
        "hourly": "temperature_2m,precipitation_probability,precipitation,rain,weather_code,wind_speed_10m",
        "timezone": timezone or "auto",
        "forecast_days": 16,
    }

    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            resp = await client.get(FORECAST_API_URL, params=params)

        if resp.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Open-Meteo forecast rate limit exceeded. Please try again shortly.",
            )

        if resp.status_code != 200:
            logger.error("Open-Meteo forecast error HTTP %d: %s", resp.status_code, resp.text)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Upstream weather forecast service returned an error.",
            )

        data = resp.json()
        raw_hourly = data.get("hourly") or {}
        raw_units = data.get("hourly_units") or {}

        hourly_units = HourlyUnits(
            time=raw_units.get("time", "iso8601"),
            temperature_2m=raw_units.get("temperature_2m", "°C"),
            precipitation_probability=raw_units.get("precipitation_probability", "%"),
            precipitation=raw_units.get("precipitation", "mm"),
            rain=raw_units.get("rain", "mm"),
            weather_code=raw_units.get("weather_code", "wmo code"),
            wind_speed_10m=raw_units.get("wind_speed_10m", "km/h"),
        )

        hourly = HourlyForecast(
            time=raw_hourly.get("time") or [],
            temperature_2m=raw_hourly.get("temperature_2m") or [],
            precipitation_probability=raw_hourly.get("precipitation_probability") or [],
            precipitation=raw_hourly.get("precipitation") or [],
            rain=raw_hourly.get("rain") or [],
            weather_code=raw_hourly.get("weather_code") or [],
            wind_speed_10m=raw_hourly.get("wind_speed_10m") or [],
        )

        iso_now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        forecast_response = ForecastResponse(
            latitude=float(data.get("latitude", rounded_lat)),
            longitude=float(data.get("longitude", rounded_lng)),
            timezone=str(data.get("timezone", timezone)),
            hourly_units=hourly_units,
            hourly=hourly,
            attribution="Weather forecast data: Open-Meteo.com",
            attribution_url="https://open-meteo.com/",
            fetched_at=iso_now,
        )

        _forecast_cache[cache_key] = (now, forecast_response)
        return forecast_response

    except httpx.TimeoutException:
        logger.warning("Open-Meteo forecast request timed out for (%f, %f)", rounded_lat, rounded_lng)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Weather forecast lookup timed out. Please try again.",
        )
    except httpx.RequestError as exc:
        logger.error("Network error during forecast fetch: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to connect to Open-Meteo weather service.",
        )
