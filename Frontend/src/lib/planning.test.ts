import { describe, expect, it } from "vitest";
import { createSeedState } from "@/data/seed";
import {
  approveProposal,
  buildProposal,
  overviewMetrics,
  parseIntent,
  rejectProposal,
} from "./planning";

const AT = "2026-10-22T12:00:00";

describe("planning", () => {
  it("recommends Seminar Hall A for TechFest", () => {
    const p = buildProposal(createSeedState(), "techfest")!;
    expect(p.toVenueId).toBe("hall-a");
  });

  it("never lists too-small or conflicting venues as eligible", () => {
    const p = buildProposal(createSeedState(), "techfest")!;
    const eligible = p.evaluations.filter((e) => e.eligible).map((e) => e.venue.id);
    expect(eligible).toEqual(["hall-a"]);
    expect(p.evaluations.find((e) => e.venue.id === "hall-b")!.checks.capacity).toBe(false);
    expect(p.evaluations.find((e) => e.venue.id === "conf-2")!.checks.availability).toBe(false);
  });

  it("reject changes no event or booking", () => {
    const s = createSeedState();
    const next = rejectProposal(s, buildProposal(s, "techfest")!.id, AT);
    expect(next.events).toEqual(s.events);
    expect(next.bookings).toEqual(s.bookings);
    expect(next.decisions.at(-1)!.outcome).toBe("rejected");
  });

  it("approve moves event and booking once, and blocks a second approval", () => {
    const s = createSeedState();
    const id = buildProposal(s, "techfest")!.id;
    const next = approveProposal(s, id, AT);
    expect(next.events.find((e) => e.id === "techfest")!.venueId).toBe("hall-a");
    expect(next.bookings.find((b) => b.id === "bk-techfest")!.venueId).toBe("hall-a");
    expect(next.events.find((e) => e.id === "techfest")!.risk!.status).toBe("handled");
    expect(() => approveProposal(next, id, AT)).toThrow();
    expect(overviewMetrics(next).atRisk).toHaveLength(0);
  });

  it("dashboard counts match seed data", () => {
    const m = overviewMetrics(createSeedState());
    expect([m.upcoming.length, m.atRisk.length, m.suitable]).toEqual([3, 1, 1]);
  });

  it("classifies limited intents", () => {
    expect(parseIntent("check risk")).toBe("check_risk");
    expect(parseIntent("find an alternative")).toBe("find_alternative");
    expect(parseIntent("show plan")).toBe("show_plan");
    expect(parseIntent("order pizza")).toBe("unsupported");
  });
});
