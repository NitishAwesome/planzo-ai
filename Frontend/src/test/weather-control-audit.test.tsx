import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DisruptionControlCard } from "@/components/DisruptionControlCard";
import * as store from "@/services/demo-store";
import * as api from "@/services/weather-api";

describe("forecast request lifecycle", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-22T09:00:00").getTime());
    store.resetDemo();
    store.setEventLocationAction("techfest", {
      name: "Mumbai",
      latitude: 19.07,
      longitude: 72.87,
      timezone: "Asia/Kolkata",
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const response: api.HourlyForecastResponse = {
    latitude: 19.07,
    longitude: 72.87,
    timezone: "Asia/Kolkata",
    hourly_units: {},
    fetched_at: "2026-10-22T08:00:00Z",
    hourly: {
      time: ["2026-10-23T11:00", "2026-10-23T12:00", "2026-10-23T13:00"],
      precipitation_probability: [90, 90, 90],
      precipitation: [3, 4, 2],
      rain: [0, 0, 0],
      wind_speed_10m: [5, 5, 5],
    },
  };
  function openCard() {
    const state = store.getDemoStateSnapshot();
    render(<DisruptionControlCard event={state.events[0]!} venue={state.venues[0]} />);
    fireEvent.click(screen.getByRole("button", { name: /Mode B/ }));
    fireEvent.click(screen.getByRole("button", { name: "Check Live Forecast" }));
  }

  it("cannot repopulate demo risk after a reset while weather is in flight", async () => {
    let resolve!: (data: api.HourlyForecastResponse) => void;
    vi.spyOn(api, "fetchHourlyForecast").mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const write = vi.spyOn(store, "setEventWeatherRiskAction");
    openCard();
    store.resetDemo();
    await act(async () => {
      resolve(response);
    });
    expect(write).not.toHaveBeenCalled();
    expect(store.getDemoStateSnapshot().events[0]!.risk?.source).toBe("Simulated scenario");
  });

  it("uses upstream freshness instead of claiming cached data was fetched just now", async () => {
    vi.spyOn(api, "fetchHourlyForecast").mockResolvedValue(response);
    const write = vi.spyOn(store, "setEventWeatherRiskAction");
    openCard();
    await waitFor(() => expect(write).toHaveBeenCalled());
    expect(store.getDemoStateSnapshot().events[0]!.risk?.forecastMetadata?.fetchedAt).toBe(
      response.fetched_at,
    );
  });
});
