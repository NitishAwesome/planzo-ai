import { describe, expect, it } from "vitest";
import { createSeedState } from "@/data/seed";
import type { EventFormData, PlanEvent } from "@/data/types";
import {
  approveProposal,
  buildAttendeeAnnouncement,
  buildProposal,
  cancelEvent,
  createEvent,
  evaluateLiveWeatherRisk,
  setEventWeatherRisk,
  setEventLocation,
  updateEvent,
  updateVenue,
} from "@/lib/planning";

const AT = "2026-10-23T09:00:00";
function form(event: PlanEvent): EventFormData {
  return {
    name: event.name,
    date: event.start.slice(0, 10),
    startTime: event.start.slice(11, 16),
    endTime: event.end.slice(11, 16),
    attendees: event.attendees,
    venueId: event.venueId,
    requiredEquipment: event.requiredEquipment,
    simulateRisk: event.risk?.source === "Simulated scenario",
  };
}

describe("independent audit regressions", () => {
  it("prevents two recoveries from reserving the same room at the same time", () => {
    const state = createSeedState();
    const second = createEvent(
      state,
      {
        ...form(state.events[0]!),
        name: "Second recovery",
        venueId: "hall-b",
        attendees: 20,
      },
      AT,
    );
    const firstProposal = buildProposal(second.state, "techfest")!;
    const competingProposal = buildProposal(second.state, second.event.id)!;
    expect(competingProposal.toVenueId).toBe(firstProposal.toVenueId);
    const recovered = approveProposal(second.state, firstProposal.id, AT);
    expect(() => approveProposal(recovered, competingProposal.id, AT)).toThrow(/no longer valid/);
  });

  it("requires a new approval after a candidate venue is edited", () => {
    const state = createSeedState();
    const old = buildProposal(state, "techfest")!;
    const venue = state.venues.find((v) => v.id === old.toVenueId)!;
    const changed = updateVenue(state, venue.id, { ...venue, capacity: 85 }, AT).state;
    expect(buildProposal(changed, "techfest")!.toVenueId).toBe(venue.id);
    expect(() => approveProposal(changed, old.id, AT)).toThrow(/no longer valid/);
  });

  it("invalidates forecast evidence when the event location changes", () => {
    const state = createSeedState();
    const live = setEventWeatherRisk(
      state,
      "techfest",
      {
        ...state.events[0]!.risk!,
        source: "Forecast from Open-Meteo",
      },
      "forecast",
      AT,
    );
    const changed = setEventLocation(live, "techfest", {
      name: "London",
      latitude: 51.5,
      longitude: -0.1,
    });
    expect(changed.events[0]!.risk).toBeNull();
    expect(buildProposal(changed, "techfest")).toBeNull();
  });

  it("rescheduling a cancelled event restores its booking and conflict protection", () => {
    const cancelled = cancelEvent(createSeedState(), "techfest", AT);
    const event = cancelled.events[0]!;
    const result = updateEvent(cancelled, event.id, form(event), AT);
    expect(result.event.status).toBe("scheduled");
    expect(result.state.bookings.find((b) => b.id === event.bookingId)).toMatchObject({
      eventId: event.id,
      venueId: event.venueId,
      start: event.start,
      end: event.end,
    });
    expect(() =>
      createEvent(result.state, { ...form(event), name: "Competing event" }, AT),
    ).toThrow(/already booked/i);
  });

  it("invalidates pending approvals when event requirements change", () => {
    const state = createSeedState();
    const old = buildProposal(state, "techfest")!;
    const changed = updateEvent(
      state,
      "techfest",
      { ...form(state.events[0]!), attendees: 55 },
      AT,
    ).state;
    expect(() => approveProposal(changed, old.id, AT)).toThrow(/no longer valid/i);
  });

  it("allows a new recovery after an event returns to its original venue", () => {
    const state = createSeedState();
    const first = buildProposal(state, "techfest")!;
    const recovered = approveProposal(state, first.id, AT);
    const movedBack = updateEvent(
      recovered,
      "techfest",
      {
        ...form(recovered.events[0]!),
        venueId: "courtyard",
        simulateRisk: true,
      },
      AT,
    ).state;
    const active = setEventWeatherRisk(
      movedBack,
      "techfest",
      state.events[0]!.risk,
      "simulated",
      AT,
    );
    const second = buildProposal(active, "techfest")!;
    expect(second.id).not.toBe(first.id);
    expect(approveProposal(active, second.id, AT).events[0]!.venueId).toBe("hall-a");
  });

  it("preserves live forecast evidence when editing unrelated event details", () => {
    const state = createSeedState();
    const risk = { ...state.events[0]!.risk!, source: "Forecast from Open-Meteo" as const };
    const live = setEventWeatherRisk(state, "techfest", risk, "forecast", AT);
    const result = updateEvent(
      live,
      "techfest",
      { ...form(live.events[0]!), name: "Renamed workshop" },
      AT,
    );
    expect(result.event.risk?.source).toBe("Forecast from Open-Meteo");
    expect(result.event.risk).toEqual(risk);
  });

  it("does not describe a real forecast as a simulated announcement", () => {
    const event = createSeedState().events[0]!;
    event.risk = { ...event.risk!, source: "Forecast from Open-Meteo" };
    const draft = buildAttendeeAnnouncement(event, "Courtyard", "Hall A");
    expect(draft.body).toContain("Open-Meteo");
    expect(draft.body).not.toMatch(/simulated/i);
    expect(draft.body).toContain("Draft — not sent");
  });

  const event = createSeedState().events[0]!;
  const venue = createSeedState().venues[0]!;
  const forecast = () => ({
    time: ["2026-10-23T10:00", "2026-10-23T11:00", "2026-10-23T12:00", "2026-10-23T13:00"],
    precipitation_probability: [10, 10, 10, 10] as (number | null)[],
    precipitation: [0, 0, 0, 0] as (number | null)[],
    rain: [0, 0, 0, 0] as (number | null)[],
    wind_speed_10m: [5, 5, 5, 5] as (number | null)[],
  });

  it("keeps incomplete forecasts unknown instead of clearing a risk", () => {
    const data = forecast();
    data.precipitation_probability = [null, null, null, null];
    data.precipitation = [null, null, null, null];
    data.rain = [null, null, null, null];
    expect(evaluateLiveWeatherRisk(data, event, venue, AT).canForecast).toBe(false);
  });

  it("requires the forecast to cover the full event window", () => {
    const data = forecast();
    for (const values of Object.values(data)) values.pop();
    expect(evaluateLiveWeatherRisk(data, event, venue, AT).canForecast).toBe(false);
  });

  it("uses total precipitation so convective showers are not discarded", () => {
    const data = forecast();
    data.precipitation = [0, 3, 4, 2];
    expect(evaluateLiveWeatherRisk(data, event, venue, AT).risk).not.toBeNull();
  });

  it("uses precipitation intervals from the preceding hour", () => {
    const data = forecast();
    data.precipitation_probability = [95, 10, 10, 10];
    data.precipitation = [5, 0, 0, 0];
    const result = evaluateLiveWeatherRisk(data, event, venue, AT);
    expect(result.canForecast).toBe(true);
    expect(result.risk).toBeNull();
    expect(result.totalRainMm).toBe(0);
  });

  it("rejects impossible calendar dates before creating bookings", () => {
    const input = { ...form(event), date: "2026-02-30" };
    expect(() => createEvent(createSeedState(), input, AT)).toThrow(/date/i);
  });
});
