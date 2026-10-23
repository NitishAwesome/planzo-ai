import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearWeatherCaches,
  fetchHourlyForecast,
  searchLocations,
  WeatherApiError,
  WEATHER_ATTRIBUTION,
  WEATHER_ATTRIBUTION_URL,
} from "@/services/weather-api";

describe("weather-api service", () => {
  beforeEach(() => {
    clearWeatherCaches();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearWeatherCaches();
  });

  it("exposes public attribution constants for Open-Meteo", () => {
    expect(WEATHER_ATTRIBUTION).toBe("Weather forecast data: Open-Meteo.com");
    expect(WEATHER_ATTRIBUTION_URL).toBe("https://open-meteo.com/");
  });

  it("searchLocations returns empty array for queries with length < 2", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const results = await searchLocations("a");
    expect(results).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("searchLocations queries backend geocoding and caches identical queries", async () => {
    const mockLocations = [
      {
        name: "Mumbai",
        latitude: 19.076,
        longitude: 72.8777,
        country: "India",
        admin1: "Maharashtra",
        timezone: "Asia/Kolkata",
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => mockLocations,
    } as Response);

    const first = await searchLocations("Mumbai");
    expect(first).toEqual(mockLocations);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call should hit in-memory cache
    const second = await searchLocations("mumbai");
    expect(second).toEqual(mockLocations);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("searchLocations throws WeatherApiError on backend HTTP failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      text: async () => "Upstream error",
    } as Response);

    await expect(searchLocations("London")).rejects.toThrow(WeatherApiError);
  });

  it("fetchHourlyForecast retrieves hourly data and respects forceFresh bypass", async () => {
    const mockForecast = {
      latitude: 19.076,
      longitude: 72.8777,
      timezone: "Asia/Kolkata",
      hourly_units: {
        precipitation_probability: "%",
        precipitation: "mm",
        wind_speed_10m: "km/h",
      },
      hourly: {
        time: ["2026-10-23T10:00", "2026-10-23T11:00"],
        precipitation_probability: [75, 80],
        precipitation: [2.5, 3.0],
        rain: [2.5, 3.0],
        wind_speed_10m: [15, 18],
      },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockForecast,
    } as Response);

    const first = await fetchHourlyForecast(19.076, 72.8777, "Asia/Kolkata");
    expect(first.hourly.precipitation_probability).toEqual([75, 80]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Cached call
    const cached = await fetchHourlyForecast(19.076, 72.8777, "Asia/Kolkata");
    expect(cached).toEqual(mockForecast);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Fresh call with forceFresh = true
    const fresh = await fetchHourlyForecast(19.076, 72.8777, "Asia/Kolkata", true);
    expect(fresh).toEqual(mockForecast);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("fetchHourlyForecast throws WeatherApiError on provider timeout or network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Connection refused"));

    await expect(fetchHourlyForecast(0, 0)).rejects.toThrow(WeatherApiError);
  });
});
