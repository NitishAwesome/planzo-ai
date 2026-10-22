export type Equipment = "projector" | "microphones" | "seating";

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  projector: "Projector",
  microphones: "Microphones",
  seating: "Seating",
};

export interface Venue {
  id: string;
  name: string;
  building: string;
  indoor: boolean;
  capacity: number;
  equipment: Equipment[];
}

/** Local wall-clock timestamps, format "yyyy-MM-ddTHH:mm:ss" (no timezone). */
export type LocalDateTime = string;

export interface Booking {
  id: string;
  venueId: string;
  /** Set when the booking belongs to a Planzo event; otherwise an external holder. */
  eventId: string | null;
  holder: string;
  start: LocalDateTime;
  end: LocalDateTime;
}

export type RiskKind = "heavy-rain";

export interface Risk {
  kind: RiskKind;
  title: string;
  detail: string;
  /** Always "Simulated scenario" in this prototype — no live forecast. */
  source: "Simulated scenario";
  probability: number;
  window: string;
  status: "active" | "handled";
}

export interface PlanEvent {
  id: string;
  name: string;
  organizer: string;
  start: LocalDateTime;
  end: LocalDateTime;
  attendees: number;
  venueId: string;
  bookingId: string;
  requiredEquipment: Equipment[];
  schedule: { time: string; item: string }[];
  risk: Risk | null;
}

export type DecisionOutcome = "approved" | "rejected";

export interface Decision {
  id: string;
  eventId: string;
  proposalId: string;
  outcome: DecisionOutcome;
  fromVenueId: string;
  toVenueId: string;
  at: LocalDateTime;
  explanation: string;
  seeded?: boolean;
}

export interface DemoState {
  version: 1;
  venues: Venue[];
  bookings: Booking[];
  events: PlanEvent[];
  decisions: Decision[];
  approvedProposalIds: string[];
}
