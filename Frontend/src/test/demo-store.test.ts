import { beforeEach, describe, expect, it } from "vitest";
import {
  approve,
  cancelEventAction,
  createEventAction,
  createVenueAction,
  deleteEventAction,
  deleteVenueAction,
  reject,
  resetDemo,
  setEventWeatherRiskAction,
  updateEventAction,
  updateVenueAction,
} from "@/services/demo-store";
import { buildProposal } from "@/lib/planning";
import { createSeedState } from "@/data/seed";

const STORAGE_KEY = "planzo-demo-state-v1";

describe("demo-store service", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetDemo();
  });

  it("resets demo and writes seed state to localStorage", () => {
    resetDemo();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.version).toBe(1);
    expect(stored.events).toHaveLength(3);
    expect(stored.decisions).toHaveLength(1);
    expect(stored.decisions[0].id).toBe("d-seed-1");
  });

  it("approves a proposal and updates localStorage", () => {
    const seed = createSeedState();
    const proposal = buildProposal(seed, "techfest");
    expect(proposal).not.toBeNull();

    approve(proposal!.id);

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    const techfest = stored.events.find((e: { id: string }) => e.id === "techfest");
    expect(techfest.venueId).toBe("hall-a");
    expect(techfest.risk.status).toBe("handled");
    expect(stored.decisions).toHaveLength(2);
    expect(stored.decisions.at(-1)?.outcome).toBe("approved");
  });

  it("rejects a proposal and records rejected decision without changing venue", () => {
    const seed = createSeedState();
    const proposal = buildProposal(seed, "techfest");
    expect(proposal).not.toBeNull();

    reject(proposal!.id);

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    const techfest = stored.events.find((e: { id: string }) => e.id === "techfest");
    expect(techfest.venueId).toBe("courtyard");
    expect(stored.decisions).toHaveLength(2);
    expect(stored.decisions.at(-1)?.outcome).toBe("rejected");
  });

  it("resetDemo restores clean state after an approval", () => {
    const seed = createSeedState();
    const proposal = buildProposal(seed, "techfest");
    approve(proposal!.id);

    resetDemo();

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    const techfest = stored.events.find((e: { id: string }) => e.id === "techfest");
    expect(techfest.venueId).toBe("courtyard");
    expect(techfest.risk.status).toBe("active");
    expect(stored.decisions).toHaveLength(1);
    expect(stored.decisions[0].id).toBe("d-seed-1");
  });

  it("increments resetKey on resetDemo to invalidate stale UI and streams", () => {
    resetDemo();
    const stored1 = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored1.resetKey).toBeDefined();
    const key1 = stored1.resetKey;

    resetDemo();
    const stored2 = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored2.resetKey).toBeGreaterThan(key1);
  });

  it("createEventAction adds event to state and localStorage", () => {
    const created = createEventAction({
      name: "Autonomous AI Summit",
      date: "2026-10-29",
      startTime: "13:00",
      endTime: "15:00",
      attendees: 35,
      venueId: "conf-2",
      requiredEquipment: ["projector"],
    });

    expect(created.id).toBe("autonomous-ai-summit");
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(
      stored.events.find((e: { id: string }) => e.id === "autonomous-ai-summit"),
    ).toBeDefined();
    expect(
      stored.bookings.find((b: { eventId: string }) => b.eventId === "autonomous-ai-summit"),
    ).toBeDefined();
    expect(stored.decisions.at(-1)?.outcome).toBe("created");
  });

  it("updateEventAction updates event and localStorage", () => {
    updateEventAction("techfest", {
      name: "TechFest Rescheduled",
      date: "2026-10-23",
      startTime: "11:00",
      endTime: "14:00",
      attendees: 40,
      venueId: "courtyard",
      requiredEquipment: ["projector", "seating"],
    });

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    const ev = stored.events.find((e: { id: string }) => e.id === "techfest");
    expect(ev.name).toBe("TechFest Rescheduled");
    expect(ev.attendees).toBe(40);
    expect(stored.decisions.at(-1)?.outcome).toBe("updated");
  });

  it("cancelEventAction sets event status cancelled and frees booking in localStorage", () => {
    cancelEventAction("techfest");

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    const ev = stored.events.find((e: { id: string }) => e.id === "techfest");
    expect(ev.status).toBe("cancelled");
    expect(
      stored.bookings.find((b: { eventId: string }) => b.eventId === "techfest"),
    ).toBeUndefined();
    expect(stored.decisions.at(-1)?.outcome).toBe("cancelled");
  });

  it("deleteEventAction deletes event from localStorage while preserving decisions", () => {
    deleteEventAction("alumni");

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.events.find((e: { id: string }) => e.id === "alumni")).toBeUndefined();
    expect(
      stored.bookings.find((b: { eventId: string }) => b.eventId === "alumni"),
    ).toBeUndefined();
    const d = stored.decisions.find((x: { eventId: string }) => x.eventId === "alumni");
    expect(d.eventName).toBe("Alumni Networking Evening");
  });

  it("resetDemo clears created events and restores clean baseline", () => {
    createEventAction({
      name: "Temporary Hackathon",
      date: "2026-10-30",
      startTime: "09:00",
      endTime: "18:00",
      attendees: 50,
      venueId: "courtyard",
      requiredEquipment: ["seating"],
    });

    let stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.events).toHaveLength(4);

    resetDemo();

    stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.events).toHaveLength(3);
    expect(
      stored.events.find((e: { id: string }) => e.id === "temporary-hackathon"),
    ).toBeUndefined();
  });

  it("createVenueAction adds venue to localStorage and state", () => {
    const venue = createVenueAction({
      name: "Robotics Arena",
      building: "Engineering Block C",
      capacity: 90,
      indoor: true,
      equipment: ["projector", "seating"],
      notes: "Heavy power grid available",
    });

    expect(venue.id).toBe("robotics-arena");
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.venues.find((v: { id: string }) => v.id === "robotics-arena")).toBeDefined();
    expect(stored.decisions.at(-1)?.outcome).toBe("venue_created");
  });

  it("updateVenueAction modifies venue in localStorage", () => {
    updateVenueAction("hall-b", {
      name: "Seminar Hall B (Expanded)",
      capacity: 85,
      indoor: true,
      equipment: ["projector", "microphones", "seating"],
    });

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    const v = stored.venues.find((x: { id: string }) => x.id === "hall-b");
    expect(v.capacity).toBe(85);
    expect(v.name).toBe("Seminar Hall B (Expanded)");
    expect(stored.decisions.at(-1)?.outcome).toBe("venue_updated");
  });

  it("deleteVenueAction removes unused venue from localStorage", () => {
    createVenueAction({
      name: "Temporary Pop-up",
      capacity: 25,
      indoor: true,
      equipment: ["seating"],
    });

    deleteVenueAction("temporary-pop-up");
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.venues.find((v: { id: string }) => v.id === "temporary-pop-up")).toBeUndefined();
    expect(stored.decisions.at(-1)?.outcome).toBe("venue_deleted");
  });

  it("deleteVenueAction throws when attempting to delete a venue with active bookings", () => {
    expect(() => deleteVenueAction("courtyard")).toThrow(/Cannot delete/);
  });

  it("setEventWeatherRiskAction updates risk and mode in localStorage", () => {
    setEventWeatherRiskAction(
      "design-review",
      {
        kind: "heavy-rain",
        title: "Rain forecast from Open-Meteo",
        detail: "65% rain probability detected during event window",
        source: "Forecast from Open-Meteo",
        probability: 65,
        window: "14:00 – 16:00",
        status: "active",
      },
      "forecast",
    );

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    const ev = stored.events.find((e: { id: string }) => e.id === "design-review");
    expect(ev.risk.source).toBe("Forecast from Open-Meteo");
    expect(ev.weatherMode).toBe("forecast");
    expect(stored.decisions.at(-1)?.outcome).toBe("risk_updated");

    // Dismiss risk
    setEventWeatherRiskAction("design-review", null);
    const storedAfter = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(
      storedAfter.events.find((e: { id: string }) => e.id === "design-review").risk,
    ).toBeNull();
    expect(storedAfter.decisions.at(-1)?.outcome).toBe("risk_dismissed");
  });

  it("resetDemo clears created venues and restores original seed venues", () => {
    createVenueAction({
      name: "Custom Testing Lab",
      capacity: 50,
      indoor: true,
      equipment: ["seating"],
    });

    let stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.venues).toHaveLength(6); // 5 seed + 1 custom

    resetDemo();

    stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.venues).toHaveLength(5);
    expect(
      stored.venues.find((v: { id: string }) => v.id === "custom-testing-lab"),
    ).toBeUndefined();
  });
});
