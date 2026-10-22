import type { DemoState } from "./types";

/** Reference "today" for the demo so relative labels stay stable. */
export const DEMO_TODAY = "2026-10-22T09:00:00";

/** Single typed source of truth for all demo venues, bookings, events and weather. */
export function createSeedState(): DemoState {
  return {
    version: 1,
    venues: [
      {
        id: "courtyard",
        name: "Outdoor Courtyard",
        building: "Central Campus",
        indoor: false,
        capacity: 120,
        equipment: ["projector", "microphones", "seating"],
      },
      {
        id: "hall-a",
        name: "Seminar Hall A",
        building: "Innovation Block, L1",
        indoor: true,
        capacity: 80,
        equipment: ["projector", "microphones", "seating"],
      },
      {
        id: "hall-b",
        name: "Seminar Hall B",
        building: "Innovation Block, L1",
        indoor: true,
        capacity: 30,
        equipment: ["projector", "microphones", "seating"],
      },
      {
        id: "conf-2",
        name: "Conference Room 2",
        building: "Admin Wing, L3",
        indoor: true,
        capacity: 60,
        equipment: ["projector", "microphones", "seating"],
      },
      {
        id: "atrium",
        name: "Main Atrium",
        building: "Library Building",
        indoor: true,
        capacity: 150,
        equipment: ["microphones", "seating"],
      },
    ],
    bookings: [
      {
        id: "bk-techfest",
        venueId: "courtyard",
        eventId: "techfest",
        holder: "TechFest Workshop",
        start: "2026-10-23T10:00:00",
        end: "2026-10-23T13:00:00",
      },
      {
        id: "bk-faculty",
        venueId: "conf-2",
        eventId: null,
        holder: "Faculty Board Meeting",
        start: "2026-10-23T09:30:00",
        end: "2026-10-23T12:00:00",
      },
      {
        id: "bk-lecture",
        venueId: "hall-a",
        eventId: null,
        holder: "Guest Lecture Series",
        start: "2026-10-23T15:00:00",
        end: "2026-10-23T17:00:00",
      },
      {
        id: "bk-design",
        venueId: "hall-b",
        eventId: "design-review",
        holder: "Product Design Review",
        start: "2026-10-24T14:00:00",
        end: "2026-10-24T16:00:00",
      },
      {
        id: "bk-alumni",
        venueId: "atrium",
        eventId: "alumni",
        holder: "Alumni Networking Evening",
        start: "2026-10-27T18:00:00",
        end: "2026-10-27T20:30:00",
      },
    ],
    events: [
      {
        id: "techfest",
        name: "TechFest Workshop",
        organizer: "Student Tech Council",
        start: "2026-10-23T10:00:00",
        end: "2026-10-23T13:00:00",
        attendees: 50,
        venueId: "courtyard",
        bookingId: "bk-techfest",
        requiredEquipment: ["projector", "microphones", "seating"],
        schedule: [
          { time: "10:00", item: "Registration & welcome" },
          { time: "10:30", item: "Hands-on build session" },
          { time: "12:00", item: "Demos & feedback" },
          { time: "12:45", item: "Wrap-up" },
        ],
        risk: {
          kind: "heavy-rain",
          title: "Heavy rain during event window",
          detail:
            "Sustained heavy rain expected over the courtyard from 09:30 to 14:00. Outdoor seating and AV would be exposed.",
          source: "Simulated scenario",
          probability: 85,
          window: "09:30 – 14:00",
          status: "active",
        },
      },
      {
        id: "design-review",
        name: "Product Design Review",
        organizer: "Design Club",
        start: "2026-10-24T14:00:00",
        end: "2026-10-24T16:00:00",
        attendees: 20,
        venueId: "hall-b",
        bookingId: "bk-design",
        requiredEquipment: ["projector", "seating"],
        schedule: [
          { time: "14:00", item: "Portfolio walkthroughs" },
          { time: "15:15", item: "Critique round" },
        ],
        risk: null,
      },
      {
        id: "alumni",
        name: "Alumni Networking Evening",
        organizer: "Alumni Relations Office",
        start: "2026-10-27T18:00:00",
        end: "2026-10-27T20:30:00",
        attendees: 90,
        venueId: "atrium",
        bookingId: "bk-alumni",
        requiredEquipment: ["microphones", "seating"],
        schedule: [
          { time: "18:00", item: "Arrivals" },
          { time: "18:45", item: "Panel: careers after campus" },
          { time: "19:30", item: "Open networking" },
        ],
        risk: null,
      },
    ],
    decisions: [
      {
        id: "d-seed-1",
        eventId: "alumni",
        proposalId: "alumni:courtyard->atrium",
        outcome: "approved",
        fromVenueId: "courtyard",
        toVenueId: "atrium",
        at: "2026-10-20T16:10:00",
        explanation:
          "Sample record: moved indoors after a simulated evening wind advisory. Main Atrium fit 90 guests with microphones and seating.",
        seeded: true,
      },
    ],
    approvedProposalIds: ["alumni:courtyard->atrium"],
  };
}
