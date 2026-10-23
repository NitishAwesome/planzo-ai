import type { GeoLocation } from "@/data/types";
import { API_BASE_URL } from "./chat-api";

export const WEATHER_ATTRIBUTION = "Weather forecast data: Open-Meteo.com";
export const WEATHER_ATTRIBUTION_URL = "https://open-meteo.com/";

export interface HourlyForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly_units: Record<string, string>;
  hourly: {
    time: string[];
    precipitation_probability: (number | null)[];
    precipitation: (number | null)[];
    rain: (number | null)[];
    wind_speed_10m: (number | null)[];
    temperature_2m?: (number | null)[];
    weather_code?: (number | null)[];
  };
}

export class WeatherApiError extends Error {
  statusCode?: number | undefined;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "WeatherApiError";
    this.statusCode = statusCode;
  }
}

// In-memory caching for client-side queries
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const locationCache = new Map<string, CacheEntry<GeoLocation[]>>();
const forecastCache = new Map<string, CacheEntry<HourlyForecastResponse>>();

const LOCATION_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FORECAST_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function searchLocations(query: string, signal?: AbortSignal): Promise<GeoLocation[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const cacheKey = q.toLowerCase();
  const cached = locationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = `${API_BASE_URL.replace(/\/+$/, "")}/api/locations/search?q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, signal ? { signal } : undefined);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new WeatherApiError(
        `Location search failed (${res.status}): ${errText || res.statusText}`,
        res.status,
      );
    }

    const data = (await res.json()) as GeoLocation[];
    locationCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + LOCATION_TTL_MS,
    });
    return data;
  } catch (err: unknown) {
    if (err instanceof WeatherApiError) throw err;
    if ((err as Error)?.name === "AbortError") throw err;
    throw new WeatherApiError(
      `Unable to connect to location search service: ${(err as Error)?.message ?? "Network error"}`,
    );
  }
}

export async function fetchHourlyForecast(
  latitude: number,
  longitude: number,
  timezone: string = "auto",
  forceFresh: boolean = false,
  signal?: AbortSignal,
): Promise<HourlyForecastResponse> {
  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)},${timezone}`;
  if (!forceFresh) {
    const cached = forecastCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }
  }

  const url = `${API_BASE_URL.replace(/\/+$/, "")}/api/weather/forecast?latitude=${latitude}&longitude=${longitude}&timezone=${encodeURIComponent(timezone)}`;

  try {
    const res = await fetch(url, signal ? { signal } : undefined);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new WeatherApiError(
        `Weather forecast failed (${res.status}): ${errText || res.statusText}`,
        res.status,
      );
    }

    const data = (await res.json()) as HourlyForecastResponse;
    forecastCache.set(cacheKey, {
      data,
      expiresAt: Date.now() + FORECAST_TTL_MS,
    });
    return data;
  } catch (err: unknown) {
    if (err instanceof WeatherApiError) throw err;
    if ((err as Error)?.name === "AbortError") throw err;
    throw new WeatherApiError(
      `Unable to retrieve weather forecast: ${(err as Error)?.message ?? "Network error"}`,
    );
  }
}

export function clearWeatherCaches() {
  locationCache.clear();
  forecastCache.clear();
}
