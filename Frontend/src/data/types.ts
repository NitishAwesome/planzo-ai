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
  notes?: string | undefined;
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

export interface GeoLocation {
  name: string;
  latitude: number;
  longitude: number;
  country?: string | undefined;
  admin1?: string | undefined;
  timezone?: string | undefined;
}

export interface ForecastMetadata {
  fetchedAt: string;
  provider: "Open-Meteo";
  precipitationProbabilityMax: number;
  rainSumMm: number;
  windSpeedMaxKmh?: number | undefined;
  locationName: string;
}

export interface Risk {
  kind: RiskKind;
  title: string;
  detail: string;
  source: "Simulated scenario" | "Forecast from Open-Meteo";
  probability: number;
  window: string;
  status: "active" | "handled";
  forecastMetadata?: ForecastMetadata | undefined;
}

export interface PlanEvent {
  id: string;
  name: string;
  description?: string | undefined;
  organizer: string;
  start: LocalDateTime;
  end: LocalDateTime;
  attendees: number;
  venueId: string;
  bookingId: string;
  requiredEquipment: Equipment[];
  schedule: { time: string; item: string }[];
  risk: Risk | null;
  status?: "scheduled" | "cancelled" | "completed" | undefined;
  location?: GeoLocation | undefined;
  weatherMode?: "simulated" | "forecast" | undefined;
}

export type DecisionOutcome =
  | "approved"
  | "rejected"
  | "created"
  | "updated"
  | "cancelled"
  | "venue_created"
  | "venue_updated"
  | "venue_deleted"
  | "risk_updated"
  | "risk_dismissed";

export interface Decision {
  id: string;
  eventId: string;
  proposalId: string;
  outcome: DecisionOutcome;
  fromVenueId: string;
  toVenueId: string;
  at: LocalDateTime;
  explanation: string;
  seeded?: boolean | undefined;
  eventName?: string | undefined;
}

export interface DemoState {
  version: 1;
  venues: Venue[];
  bookings: Booking[];
  events: PlanEvent[];
  decisions: Decision[];
  approvedProposalIds: string[];
  resetKey?: number | undefined;
}

export interface EventFormData {
  name: string;
  description?: string | undefined;
  organizer?: string | undefined;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  attendees: number;
  venueId: string;
  requiredEquipment: Equipment[];
  schedule?: { time: string; item: string }[] | undefined;
  simulateRisk?: boolean | undefined;
  riskDetail?: string | undefined;
  riskProbability?: number | undefined;
  riskWindow?: string | undefined;
  location?: GeoLocation | undefined;
  weatherMode?: "simulated" | "forecast" | undefined;
}

export interface VenueFormData {
  name: string;
  building?: string | undefined;
  capacity: number;
  indoor: boolean;
  equipment: Equipment[];
  notes?: string | undefined;
}

export interface VenueValidationErrors {
  name?: string | undefined;
  capacity?: string | undefined;
  equipment?: string | undefined;
  building?: string | undefined;
  notes?: string | undefined;
}
