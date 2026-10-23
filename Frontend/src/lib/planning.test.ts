import { describe, expect, it } from "vitest";
import { createSeedState } from "@/data/seed";
import type { Equipment } from "@/data/types";
import {
  approveProposal,
  buildAttendeeAnnouncement,
  buildProposal,
  evaluateVenues,
  getEventRecoveryDecision,
  normalizeVoiceQuery,
  overviewMetrics,
  parseIntent,
  rejectProposal,
  replyFor,
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

  describe("voice query normalization & intents", () => {
    it("strips Alexa and Planzo invocations cleanly", () => {
      expect(normalizeVoiceQuery("Alexa, ask Planzo to find a safer venue")).toBe(
        "find a safer venue",
      );
      expect(normalizeVoiceQuery("Alexa, ask Planzo what's happening with TechFest")).toBe(
        "what's happening with TechFest",
      );
      expect(normalizeVoiceQuery("Alexa, tell Planzo about the weather")).toBe("the weather");
      expect(normalizeVoiceQuery("Alexa, check the risk")).toBe("check the risk");
      expect(normalizeVoiceQuery("find an alternative")).toBe("find an alternative");
    });

    it("normalizes voice invocation prefixes correctly", () => {
      expect(parseIntent("Alexa, ask Planzo what's happening with TechFest")).toBe("check_risk");
      expect(parseIntent("Alexa, ask Planzo what's wrong with TechFest")).toBe("check_risk");
      expect(parseIntent("Alexa, ask Planzo to find a safer venue")).toBe("find_alternative");
      expect(parseIntent("Alexa, ask Planzo why Seminar Hall B won't work")).toBe(
        "find_alternative",
      );
      expect(parseIntent("Alexa, ask Planzo to show the recovery plan")).toBe("show_plan");
      expect(parseIntent("Alexa, ask Planzo how many attendees are affected")).toBe("show_plan");
    });

    it("intercepts conversational approval commands with safe guidance", () => {
      expect(parseIntent("Alexa, approve this change")).toBe("approve_guidance");
      expect(parseIntent("Please confirm and apply")).toBe("approve_guidance");

      const state = createSeedState();
      const reply = replyFor(state, "techfest", "approve_guidance");
      expect(reply.intent).toBe("approve_guidance");
      expect(reply.showProposal).toBe(true);
      expect(reply.text).toContain("cannot be executed conversationally");
      expect(reply.text).toContain('explicit "Approve" button');
    });
  });

  describe("attendee communication draft & recovery decisions (M4)", () => {
    it("generates an accurate, grounded announcement draft for TechFest Workshop", () => {
      const state = createSeedState();
      const event = state.events.find((e) => e.id === "techfest")!;

      const announcement = buildAttendeeAnnouncement(event, "Outdoor Courtyard", "Seminar Hall A");

      expect(announcement.subject).toBe("Important Venue Update — TechFest Workshop");
      expect(announcement.body).toContain(
        "Due to a simulated heavy-rain contingency, the TechFest Workshop has been relocated from Outdoor Courtyard to Seminar Hall A.",
      );
      expect(announcement.body).toContain("The event date and time remain unchanged.");
      expect(announcement.body).toContain("Please proceed to Seminar Hall A for the workshop.");
      expect(announcement.body).toContain("Event Operations Team");
      expect(announcement.fullText).toContain(
        "Subject: Important Venue Update — TechFest Workshop",
      );
    });

    it("tracks approved recovery decision and ignores rejections", () => {
      const s0 = createSeedState();
      // No approved decision for techfest initially
      expect(getEventRecoveryDecision(s0, "techfest")).toBeUndefined();

      // After rejection: no approved recovery decision
      const proposal = buildProposal(s0, "techfest")!;
      const rejectedState = rejectProposal(s0, proposal.id, AT);
      expect(getEventRecoveryDecision(rejectedState, "techfest")).toBeUndefined();

      // After approval: returns the recorded approval decision
      const approvedState = approveProposal(s0, proposal.id, AT);
      const decision = getEventRecoveryDecision(approvedState, "techfest");
      expect(decision).toBeDefined();
      expect(decision?.outcome).toBe("approved");
      expect(decision?.fromVenueId).toBe("courtyard");
      expect(decision?.toVenueId).toBe("hall-a");
    });
  });

  describe("dynamic data & eligibility audit (M5)", () => {
    it("updates venue eligibility dynamically when attendee count changes", () => {
      const s = createSeedState();
      // Increase attendees from 50 to 90
      const largeEventState = {
        ...s,
        events: s.events.map((e) => (e.id === "techfest" ? { ...e, attendees: 90 } : e)),
      };

      const event = largeEventState.events.find((e) => e.id === "techfest")!;
      const evaluations = evaluateVenues(largeEventState, event);

      // Hall A (80 seats) should now fail capacity
      const hallA = evaluations.find((ev) => ev.venue.id === "hall-a")!;
      expect(hallA.checks.capacity).toBe(false);
      expect(hallA.reasons).toContain("Too small: 80 seats for 90 attendees");
      expect(hallA.eligible).toBe(false);

      // Proposal should now be null since no indoor venue has 90 seats AND all equipment AND is free
      const proposal = buildProposal(largeEventState, "techfest");
      expect(proposal).toBeNull();
    });

    it("updates venue eligibility dynamically when venue capacity changes", () => {
      const s = createSeedState();
      // Reduce Hall A capacity from 80 to 45 (TechFest has 50 attendees)
      const constrainedState = {
        ...s,
        venues: s.venues.map((v) => (v.id === "hall-a" ? { ...v, capacity: 45 } : v)),
      };

      const event = constrainedState.events.find((e) => e.id === "techfest")!;
      const evaluations = evaluateVenues(constrainedState, event);
      const hallA = evaluations.find((ev) => ev.venue.id === "hall-a")!;
      expect(hallA.checks.capacity).toBe(false);
      expect(hallA.reasons).toContain("Too small: 45 seats for 50 attendees");
    });

    it("excludes venue dynamically when booking conflict is introduced", () => {
      const s = createSeedState();
      // Introduce an overlapping booking in Hall A
      const bookedState = {
        ...s,
        bookings: [
          ...s.bookings,
          {
            id: "bk-conflict",
            venueId: "hall-a",
            eventId: null,
            holder: "Emergency Workshop",
            start: "2026-10-23T11:00:00",
            end: "2026-10-23T12:00:00",
          },
        ],
      };

      const event = bookedState.events.find((e) => e.id === "techfest")!;
      const evaluations = evaluateVenues(bookedState, event);
      const hallA = evaluations.find((ev) => ev.venue.id === "hall-a")!;
      expect(hallA.checks.availability).toBe(false);
      expect(hallA.conflict).not.toBeNull();
      expect(hallA.conflict?.holder).toBe("Emergency Workshop");
      expect(hallA.eligible).toBe(false);
    });

    it("filters upcoming events dynamically with custom asOf timestamp", () => {
      const s = createSeedState();
      // Default asOf is 2026-10-22T09:00:00 -> 3 upcoming events
      const defaultMetrics = overviewMetrics(s);
      expect(defaultMetrics.upcoming).toHaveLength(3);

      // Advance asOf past TechFest (ends 2026-10-23T13:00:00)
      const futureMetrics = overviewMetrics(s, "2026-10-24T00:00:00");
      expect(futureMetrics.upcoming).toHaveLength(2);
      expect(futureMetrics.upcoming.map((e) => e.id)).toEqual(["design-review", "alumni"]);
      expect(futureMetrics.atRisk).toHaveLength(0);
    });

    it("derives assistant risk reply dynamically from event equipment and venue setting", () => {
      const s = createSeedState();
      // Event with custom equipment requirement
      const customEventState = {
        ...s,
        events: s.events.map((e) =>
          e.id === "techfest"
            ? {
                ...e,
                requiredEquipment: ["projector"] as Equipment[],
              }
            : e,
        ),
      };

      const reply = replyFor(customEventState, "techfest", "check_risk");
      expect(reply.text).toContain("projector setup are exposed");
      expect(reply.text).not.toContain("AV setup");
    });
  });
});
