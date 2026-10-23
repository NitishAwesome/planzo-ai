import { describe, expect, it } from "vitest";
import { createSeedState } from "@/data/seed";
import type { Equipment } from "@/data/types";
import {
  approveProposal,
  buildAttendeeAnnouncement,
  buildProposal,
  cancelEvent,
  checkBookingConflict,
  createEvent,
  createVenue,
  deleteEvent,
  deleteVenue,
  evaluateLiveWeatherRisk,
  evaluateVenues,
  generateVenueId,
  getEventRecoveryDecision,
  getVenueBookings,
  normalizeVoiceQuery,
  overviewMetrics,
  parseIntent,
  rejectProposal,
  replyFor,
  setEventLocation,
  setEventWeatherRisk,
  updateEvent,
  updateVenue,
  validateEventInput,
  validateVenueInput,
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

  describe("P6A intent classification correctness & safety precedence", () => {
    it("correctly classifies all P6A evaluation benchmark queries", () => {
      expect(parseIntent("What's happening with TechFest Workshop?")).toBe("check_risk");
      expect(parseIntent("Approve this venue change")).toBe("approve_guidance");
      expect(parseIntent("Approve this change and move it")).toBe("approve_guidance");
      expect(parseIntent("Find a safer venue")).toBe("find_alternative");
      expect(parseIntent("Why won't Seminar Hall B work?")).toBe("find_alternative");
      expect(parseIntent("What's the risk?")).toBe("check_risk");
      expect(parseIntent("Show me the recovery plan")).toBe("show_plan");
    });

    it("prevents accidental substring matches inside unrelated words", () => {
      // 'work' inside 'Workshop', 'network', 'artwork' must not trigger find_alternative
      expect(parseIntent("Tell me about the design workshop")).toBe("unsupported");
      expect(parseIntent("What is happening with the artwork session?")).toBe("check_risk");
      expect(parseIntent("Status of alumni networking evening")).toBe("check_risk");
      // 'rain' inside 'brainstorm' must not trigger check_risk
      expect(parseIntent("Where is the brainstorming room?")).toBe("unsupported");
    });

    it("prioritizes approval and rejection safety instructions over generic venue-search detection", () => {
      expect(parseIntent("Approve the relocation to Seminar Hall A")).toBe("approve_guidance");
      expect(parseIntent("Confirm switching venues")).toBe("approve_guidance");
      expect(parseIntent("Accept this alternative venue")).toBe("approve_guidance");
      expect(parseIntent("Please execute the proposed move")).toBe("approve_guidance");
      expect(parseIntent("Reject this venue change")).toBe("approve_guidance");
      expect(parseIntent("Decline the move")).toBe("approve_guidance");
    });

    it("correctly classifies mixed-intent queries with appropriate precedence", () => {
      // When approval keyword is present, safety guidance always wins
      expect(parseIntent("Can I approve moving to a safer venue?")).toBe("approve_guidance");
      expect(parseIntent("Confirm the new indoor venue")).toBe("approve_guidance");

      // When searching for an alternative due to weather/rain, alternative search intent wins
      expect(parseIntent("Find an alternative because of the rain")).toBe("find_alternative");
      expect(parseIntent("Find a safer venue due to the weather risk")).toBe("find_alternative");
    });

    it("supports various voice prefixes cleanly", () => {
      expect(parseIntent("Alexa, ask Planzo what's happening with TechFest Workshop?")).toBe(
        "check_risk",
      );
      expect(parseIntent("Hey Alexa, ask Planzo to find a safer venue")).toBe("find_alternative");
      expect(parseIntent("Ask Planzo why Seminar Hall B won't work")).toBe("find_alternative");
      expect(parseIntent("Alexa, ask Planzo to approve this change and move it")).toBe(
        "approve_guidance",
      );
    });

    it("evaluates venue alternatives without hardcoded venue names", () => {
      expect(parseIntent("Why won't Conference Room 2 work?")).toBe("find_alternative");
      expect(parseIntent("Why won't Main Atrium work?")).toBe("find_alternative");
      expect(parseIntent("Is there any other eligible venue?")).toBe("find_alternative");
    });
  });

  describe("P6A attendee announcement correctness across multiple events", () => {
    it("includes real date, start/end time, previous and new venue, and draft disclosure for TechFest", () => {
      const state = createSeedState();
      const event = state.events.find((e) => e.id === "techfest")!;
      const ann = buildAttendeeAnnouncement(event, "Outdoor Courtyard", "Seminar Hall A");

      expect(ann.subject).toBe("Important Venue Update — TechFest Workshop");
      expect(ann.body).toContain("Date: Fri, Oct 23");
      expect(ann.body).toContain("Time: 10:00–13:00");
      expect(ann.body).toContain("Location: Seminar Hall A (previously Outdoor Courtyard)");
      expect(ann.body).toContain("The event date and time remain unchanged.");
      expect(ann.body).toContain("[Draft — not sent.");
    });

    it("formats announcements correctly for Product Design Review with different date and times", () => {
      const state = createSeedState();
      const event = state.events.find((e) => e.id === "design-review")!;
      const ann = buildAttendeeAnnouncement(event, "Seminar Hall B", "Conference Room 2");

      expect(ann.subject).toBe("Important Venue Update — Product Design Review");
      expect(ann.body).toContain("Date: Sat, Oct 24");
      expect(ann.body).toContain("Time: 14:00–16:00");
      expect(ann.body).toContain("Location: Conference Room 2 (previously Seminar Hall B)");
      expect(ann.body).toContain("[Draft — not sent.");
    });

    it("formats announcements correctly for Alumni Networking with evening schedule", () => {
      const state = createSeedState();
      const event = state.events.find((e) => e.id === "alumni")!;
      const ann = buildAttendeeAnnouncement(event, "Main Atrium", "Outdoor Courtyard");

      expect(ann.subject).toBe("Important Venue Update — Alumni Networking Evening");
      expect(ann.body).toContain("Date: Tue, Oct 27");
      expect(ann.body).toContain("Time: 18:00–20:30");
      expect(ann.body).toContain("Location: Outdoor Courtyard (previously Main Atrium)");
      expect(ann.body).toContain("[Draft — not sent.");
    });
  });

  describe("P6B event lifecycle and validation", () => {
    it("checkBookingConflict accurately detects overlaps and permits non-conflicting slots", () => {
      const s = createSeedState();
      // TechFest is courtyard 10:00–13:00 on 2026-10-23
      // Direct overlap:
      expect(
        checkBookingConflict(s, "courtyard", "2026-10-23T11:00:00", "2026-10-23T12:00:00"),
      ).not.toBeNull();

      // Overlap on start:
      expect(
        checkBookingConflict(s, "courtyard", "2026-10-23T09:00:00", "2026-10-23T10:30:00"),
      ).not.toBeNull();

      // Back-to-back immediately after (13:00–15:00): NOT a conflict
      expect(
        checkBookingConflict(s, "courtyard", "2026-10-23T13:00:00", "2026-10-23T15:00:00"),
      ).toBeNull();

      // Back-to-back immediately before (08:00–10:00): NOT a conflict
      expect(
        checkBookingConflict(s, "courtyard", "2026-10-23T08:00:00", "2026-10-23T10:00:00"),
      ).toBeNull();

      // Excluding own event ignores own booking
      expect(
        checkBookingConflict(
          s,
          "courtyard",
          "2026-10-23T10:00:00",
          "2026-10-23T13:00:00",
          "techfest",
        ),
      ).toBeNull();
    });

    it("validateEventInput enforces required fields, positive attendees and valid time ranges", () => {
      const s = createSeedState();

      // Empty name
      const res1 = validateEventInput(s, {
        name: "",
        date: "2026-10-25",
        startTime: "14:00",
        endTime: "16:00",
        attendees: 30,
        venueId: "hall-b",
        requiredEquipment: ["projector"],
      });
      expect(res1.valid).toBe(false);
      expect(res1.errors.name).toBeDefined();

      // End time before start time
      const res2 = validateEventInput(s, {
        name: "Test Workshop",
        date: "2026-10-25",
        startTime: "16:00",
        endTime: "14:00",
        attendees: 30,
        venueId: "hall-b",
        requiredEquipment: ["projector"],
      });
      expect(res2.valid).toBe(false);
      expect(res2.errors.endTime).toContain("strictly after start time");

      // Attendees exceeding venue capacity
      const res3 = validateEventInput(s, {
        name: "Test Workshop",
        date: "2026-10-25",
        startTime: "14:00",
        endTime: "16:00",
        attendees: 50, // hall-b capacity is 30
        venueId: "hall-b",
        requiredEquipment: ["projector"],
      });
      expect(res3.valid).toBe(false);
      expect(res3.errors.venueId).toContain("capacity of 30 seats");

      // Missing required equipment
      const res4 = validateEventInput(s, {
        name: "Atrium Presentation",
        date: "2026-10-25",
        startTime: "14:00",
        endTime: "16:00",
        attendees: 40,
        venueId: "atrium", // atrium has no projector
        requiredEquipment: ["projector"],
      });
      expect(res4.valid).toBe(false);
      expect(res4.errors.requiredEquipment).toContain("Projector");
    });

    it("createEvent adds event, booking, and activity record", () => {
      const s = createSeedState();
      const initialCount = s.events.length;
      const { state: next, event } = createEvent(
        s,
        {
          name: "Robotics Showcase",
          description: "Live demonstration of student autonomous rovers",
          date: "2026-10-26",
          startTime: "11:00",
          endTime: "13:00",
          attendees: 45,
          venueId: "conf-2",
          requiredEquipment: ["projector", "seating"],
          simulateRisk: true,
          riskProbability: 90,
          riskDetail: "Severe thunderstorms expected",
        },
        AT,
      );

      expect(next.events).toHaveLength(initialCount + 1);
      expect(event.id).toBe("robotics-showcase");
      expect(event.attendees).toBe(45);
      expect(event.risk?.status).toBe("active");
      expect(next.bookings.find((b) => b.eventId === event.id)).toBeDefined();
      expect(next.decisions.at(-1)?.outcome).toBe("created");
    });

    it("updateEvent modifies event and booking and logs update decision", () => {
      const s = createSeedState();
      const { state: next, event } = updateEvent(
        s,
        "techfest",
        {
          name: "TechFest Hands-on Workshop",
          date: "2026-10-23",
          startTime: "10:30",
          endTime: "13:30",
          attendees: 45,
          venueId: "courtyard",
          requiredEquipment: ["projector", "microphones"],
        },
        AT,
      );

      expect(event.name).toBe("TechFest Hands-on Workshop");
      expect(event.start).toBe("2026-10-23T10:30:00");
      const booking = next.bookings.find((b) => b.eventId === "techfest")!;
      expect(booking.start).toBe("2026-10-23T10:30:00");
      expect(next.decisions.at(-1)?.outcome).toBe("updated");
    });

    it("cancelEvent marks event cancelled, releases booking and logs activity", () => {
      const s = createSeedState();
      const next = cancelEvent(s, "techfest", AT);
      const ev = next.events.find((e) => e.id === "techfest")!;
      expect(ev.status).toBe("cancelled");
      expect(next.bookings.find((b) => b.eventId === "techfest")).toBeUndefined();
      expect(next.decisions.at(-1)?.outcome).toBe("cancelled");

      // Metrics should exclude cancelled event
      const metrics = overviewMetrics(next);
      expect(metrics.atRisk.find((e) => e.id === "techfest")).toBeUndefined();
      expect(metrics.upcoming.find((e) => e.id === "techfest")).toBeUndefined();
    });

    it("deleteEvent removes event and booking while preserving decision history with eventName", () => {
      const s = createSeedState();
      const next = deleteEvent(s, "alumni");
      expect(next.events.find((e) => e.id === "alumni")).toBeUndefined();
      expect(next.bookings.find((b) => b.eventId === "alumni")).toBeUndefined();

      // Seeded decision for alumni preserved eventName
      const pastDecision = next.decisions.find((d) => d.eventId === "alumni");
      expect(pastDecision?.eventName).toBe("Alumni Networking Evening");
    });

    it("evaluates custom event with no qualifying venues and provides evidence-based breakdown", () => {
      const s = createSeedState();
      // Create a custom event with 100 attendees needing projector in courtyard
      const { state: s2, event } = createEvent(
        s,
        {
          name: "Mega Keynote",
          date: "2026-10-28",
          startTime: "10:00",
          endTime: "12:00",
          attendees: 100, // No indoor venue with projector has capacity >= 100 (hall-a is 80)
          venueId: "courtyard",
          requiredEquipment: ["projector"],
          simulateRisk: true,
        },
        AT,
      );

      const proposal = buildProposal(s2, event.id);
      expect(proposal).toBeNull(); // No indoor venue fits 100 attendees + projector

      const reply = replyFor(s2, event.id, "find_alternative");
      expect(reply.showProposal).toBe(false);
      expect(reply.text).toContain("no indoor alternative qualifies");
      expect(reply.text).toContain("Seminar Hall A");
      expect(reply.text).toContain("Too small");
    });
  });

  describe("venue management (P6C)", () => {
    it("creates a new venue with generated unique ID and logs decision", () => {
      const s = createSeedState();
      const initialCount = s.venues.length;
      const { state: next, venue } = createVenue(
        s,
        {
          name: "Innovation Hall",
          building: "Technology Hub L2",
          capacity: 120,
          indoor: true,
          equipment: ["projector", "microphones", "seating"],
          notes: "Wheelchair accessible with dual 4K displays",
        },
        AT,
      );

      expect(next.venues).toHaveLength(initialCount + 1);
      expect(venue.id).toBe("innovation-hall");
      expect(venue.name).toBe("Innovation Hall");
      expect(venue.capacity).toBe(120);
      expect(venue.indoor).toBe(true);
      expect(venue.equipment).toContain("projector");
      expect(venue.notes).toContain("Wheelchair");
      expect(next.decisions.at(-1)?.outcome).toBe("venue_created");
    });

    it("validates venue inputs, rejecting empty name or invalid capacity", () => {
      const s = createSeedState();
      const res1 = validateVenueInput(s, {
        name: "   ",
        capacity: 50,
        indoor: true,
        equipment: ["projector"],
      });
      expect(res1.valid).toBe(false);
      expect(res1.errors.name).toBeDefined();

      const res2 = validateVenueInput(s, {
        name: "Test Hall",
        capacity: 0,
        indoor: true,
        equipment: ["projector"],
      });
      expect(res2.valid).toBe(false);
      expect(res2.errors.capacity).toBeDefined();

      const res3 = validateVenueInput(s, {
        name: "Seminar Hall A", // duplicate name
        capacity: 100,
        indoor: true,
        equipment: ["projector"],
      });
      expect(res3.valid).toBe(false);
      expect(res3.errors.name).toContain("already exists");
    });

    it("updates an existing venue's capacity, equipment and properties", () => {
      const s = createSeedState();
      const { state: next, venue } = updateVenue(
        s,
        "hall-b",
        {
          name: "Seminar Hall B (Expanded)",
          building: "Innovation Block, L1",
          capacity: 70,
          indoor: true,
          equipment: ["projector", "microphones", "seating"],
          notes: "Renovated seating layout",
        },
        AT,
      );

      expect(venue.capacity).toBe(70);
      expect(venue.name).toBe("Seminar Hall B (Expanded)");
      expect(next.venues.find((v) => v.id === "hall-b")?.capacity).toBe(70);
      expect(next.decisions.at(-1)?.outcome).toBe("venue_updated");
    });

    it("prevents reducing capacity below an active scheduled event's attendee count", () => {
      const s = createSeedState();
      // Product Design Review is at hall-b with 20 attendees
      const validation = validateVenueInput(
        s,
        {
          name: "Seminar Hall B",
          capacity: 10, // less than 20 attendees
          indoor: true,
          equipment: ["projector", "seating"],
        },
        "hall-b",
      );
      expect(validation.valid).toBe(false);
      expect(validation.errors.capacity).toContain("Product Design Review");
    });

    it("prevents removing equipment required by an active scheduled event", () => {
      const s = createSeedState();
      // Product Design Review requires "projector" and "seating"
      const validation = validateVenueInput(
        s,
        {
          name: "Seminar Hall B",
          capacity: 30,
          indoor: true,
          equipment: ["seating"], // missing projector
        },
        "hall-b",
      );
      expect(validation.valid).toBe(false);
      expect(validation.errors.equipment?.toLowerCase()).toContain("projector");
    });

    it("deletes an unused venue safely", () => {
      const s = createSeedState();
      // First add an unused venue
      const { state: sWithVenue, venue } = createVenue(
        s,
        {
          name: "Temporary Tent",
          capacity: 40,
          indoor: false,
          equipment: ["seating"],
        },
        AT,
      );

      const next = deleteVenue(sWithVenue, venue.id, AT);
      expect(next.venues.find((v) => v.id === venue.id)).toBeUndefined();
      expect(next.decisions.at(-1)?.outcome).toBe("venue_deleted");
    });

    it("blocks deletion of a venue with active reservations or scheduled events", () => {
      const s = createSeedState();
      // courtyard has TechFest booking
      expect(() => deleteVenue(s, "courtyard")).toThrow(/Cannot delete/);
      // conf-2 has Faculty Board Meeting
      expect(() => deleteVenue(s, "conf-2")).toThrow(/Cannot delete/);
    });

    it("capacity modification immediately affects eligibility and proposals", () => {
      const s = createSeedState();
      // TechFest has 50 attendees. hall-b initially has capacity 30 (ineligible)
      const evalsInitial = evaluateVenues(
        s,
        s.events.find((e) => e.id === "techfest")!,
      );
      expect(evalsInitial.find((e) => e.venue.id === "hall-b")?.checks.capacity).toBe(false);

      // Expand hall-b capacity to 65
      const { state: sUpdated } = updateVenue(
        s,
        "hall-b",
        {
          name: "Seminar Hall B",
          building: "Innovation Block, L1",
          capacity: 65,
          indoor: true,
          equipment: ["projector", "microphones", "seating"],
        },
        AT,
      );

      // Now hall-b has sufficient capacity!
      const evalsUpdated = evaluateVenues(
        sUpdated,
        sUpdated.events.find((e) => e.id === "techfest")!,
      );
      expect(evalsUpdated.find((e) => e.venue.id === "hall-b")?.checks.capacity).toBe(true);
    });

    it("newly created venue appears in proposals when it qualifies", () => {
      const s = createSeedState();
      // Create a mega event in courtyard with 100 attendees needing projector and seating
      const { state: s2, event } = createEvent(
        s,
        {
          name: "AI Symposium",
          date: "2026-10-25",
          startTime: "10:00",
          endTime: "13:00",
          attendees: 110,
          venueId: "courtyard",
          requiredEquipment: ["projector", "seating"],
          simulateRisk: true,
        },
        AT,
      );

      // Initially no indoor venue has capacity >= 110 with projector (atrium is 150 but lacks projector; hall-a is 80)
      expect(buildProposal(s2, event.id)).toBeNull();

      // Create Innovation Pavilion: 140 capacity, indoor, all equipment
      const { state: s3 } = createVenue(
        s2,
        {
          name: "Innovation Pavilion",
          building: "North Quad",
          capacity: 140,
          indoor: true,
          equipment: ["projector", "microphones", "seating"],
        },
        AT,
      );

      // Now the newly created venue is recommended!
      const proposal = buildProposal(s3, event.id);
      expect(proposal).not.toBeNull();
      expect(proposal?.toVenueId).toBe("innovation-pavilion");
    });
  });

  describe("weather risk evaluator & disruption management (P6C)", () => {
    it("evaluates precipitation risk strictly within event window", () => {
      const s = createSeedState();
      const techfest = s.events.find((e) => e.id === "techfest")!; // 10:00 to 13:00 on 2026-10-23
      const courtyard = s.venues.find((v) => v.id === "courtyard")!;

      // Synthetic forecast: 80% rain at 18:00 (outside event window), but only 10% during 10:00-13:00
      const mockForecast = {
        time: [
          "2026-10-23T08:00:00",
          "2026-10-23T11:00:00",
          "2026-10-23T12:00:00",
          "2026-10-23T18:00:00",
        ],
        precipitation_probability: [0, 15, 20, 85], // 85% is at 18:00
        precipitation: [0, 0, 0.1, 8.5],
        rain: [0, 0, 0.1, 8.5],
        wind_speed_10m: [5, 10, 12, 35],
      };

      const assessment = evaluateLiveWeatherRisk(mockForecast, techfest, courtyard, AT);
      expect(assessment.canForecast).toBe(true);
      // Max prob during event window should be 20% (not 85%)
      expect(assessment.maxPrecipitationProbability).toBe(20);
      expect(assessment.risk).toBeNull(); // Low rain (< 50%) -> no disruption triggered
    });

    it("triggers active risk when rain probability during outdoor event exceeds threshold", () => {
      const s = createSeedState();
      const techfest = s.events.find((e) => e.id === "techfest")!;
      const courtyard = s.venues.find((v) => v.id === "courtyard")!;

      const mockForecast = {
        time: [
          "2026-10-23T09:00:00",
          "2026-10-23T10:00:00",
          "2026-10-23T11:00:00",
          "2026-10-23T12:00:00",
        ],
        precipitation_probability: [40, 75, 80, 70],
        precipitation: [0.5, 3.2, 4.0, 2.1],
        rain: [0.5, 3.2, 4.0, 2.1],
        wind_speed_10m: [12, 22, 25, 20],
      };

      const assessment = evaluateLiveWeatherRisk(mockForecast, techfest, courtyard, AT);
      expect(assessment.canForecast).toBe(true);
      expect(assessment.maxPrecipitationProbability).toBe(80);
      expect(assessment.totalRainMm).toBeGreaterThan(5);
      expect(assessment.risk).not.toBeNull();
      expect(assessment.risk?.source).toBe("Forecast from Open-Meteo");
      expect(assessment.risk?.probability).toBe(80);
      expect(assessment.risk?.status).toBe("active");
    });

    it("does not trigger active rain disruption for an indoor event venue", () => {
      const s = createSeedState();
      const designReview = s.events.find((e) => e.id === "design-review")!; // at hall-b (indoor)
      const hallB = s.venues.find((v) => v.id === "hall-b")!;

      const mockForecast = {
        time: ["2026-10-24T14:00:00", "2026-10-24T15:00:00", "2026-10-24T16:00:00"],
        precipitation_probability: [90, 95, 85],
        precipitation: [5.0, 6.2, 4.0],
        rain: [5.0, 6.2, 4.0],
        wind_speed_10m: [25, 30, 28],
      };

      const assessment = evaluateLiveWeatherRisk(mockForecast, designReview, hallB, AT);
      expect(assessment.canForecast).toBe(true);
      expect(assessment.maxPrecipitationProbability).toBe(95);
      // Because venue is indoor, rain disruption does not trigger outdoor relocation
      expect(assessment.risk).toBeNull();
    });

    it("setEventWeatherRisk updates risk and records decision log", () => {
      const s = createSeedState();
      const eventId = "design-review";
      const customRisk = {
        kind: "heavy-rain" as const,
        title: "Thunderstorm warning",
        detail: "Squall line moving through campus",
        source: "Simulated scenario" as const,
        probability: 90,
        window: "14:00 – 16:00",
        status: "active" as const,
      };

      const next = setEventWeatherRisk(s, eventId, customRisk, "simulated", AT);
      const ev = next.events.find((e) => e.id === eventId)!;
      expect(ev.risk).toEqual(customRisk);
      expect(ev.weatherMode).toBe("simulated");
      expect(next.decisions.at(-1)?.outcome).toBe("risk_updated");

      // Dismissing risk
      const cleared = setEventWeatherRisk(next, eventId, null, "simulated", AT);
      expect(cleared.events.find((e) => e.id === eventId)!.risk).toBeNull();
      expect(cleared.decisions.at(-1)?.outcome).toBe("risk_dismissed");
    });
  });
});
