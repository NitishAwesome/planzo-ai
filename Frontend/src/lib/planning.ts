import type {
  Booking,
  Decision,
  DemoState,
  Equipment,
  EventFormData,
  ForecastMetadata,
  GeoLocation,
  PlanEvent,
  Risk,
  Venue,
  VenueFormData,
  VenueValidationErrors,
} from "@/data/types";
import { EQUIPMENT_LABEL } from "@/data/types";
import { DEMO_TODAY } from "@/data/seed";

export const toMs = (t: string) => Date.parse(t);

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return toMs(aStart) < toMs(bEnd) && toMs(bStart) < toMs(aEnd);
}

export const getVenue = (s: DemoState, id: string) => s.venues.find((v) => v.id === id);
export const getEvent = (s: DemoState, id: string) => s.events.find((e) => e.id === id);

export interface VenueEvaluation {
  venue: Venue;
  eligible: boolean;
  checks: { indoor: boolean; capacity: boolean; equipment: boolean; availability: boolean };
  missingEquipment: Equipment[];
  conflict: Booking | null;
  reasons: string[];
}

/** Evaluate every venue other than the event's current one against the event's needs. */
export function evaluateVenues(s: DemoState, event: PlanEvent): VenueEvaluation[] {
  const needsIndoor = event.risk?.kind === "heavy-rain";
  return s.venues
    .filter((v) => v.id !== event.venueId)
    .map((venue) => {
      const missingEquipment = event.requiredEquipment.filter((e) => !venue.equipment.includes(e));
      const conflict =
        s.bookings.find(
          (b) =>
            b.venueId === venue.id &&
            b.eventId !== event.id &&
            overlaps(b.start, b.end, event.start, event.end),
        ) ?? null;
      const checks = {
        indoor: !needsIndoor || venue.indoor,
        capacity: venue.capacity >= event.attendees,
        equipment: missingEquipment.length === 0,
        availability: conflict === null,
      };
      const reasons: string[] = [];
      if (!checks.indoor) reasons.push("Outdoor — exposed to the same weather");
      if (!checks.capacity)
        reasons.push(`Too small: ${venue.capacity} seats for ${event.attendees} attendees`);
      if (!checks.equipment)
        reasons.push(
          `Missing ${missingEquipment.map((e) => EQUIPMENT_LABEL[e].toLowerCase()).join(", ")}`,
        );
      if (conflict)
        reasons.push(
          `Booked by ${conflict.holder} ${fmtTime(conflict.start)}–${fmtTime(conflict.end)}`,
        );
      const eligible = checks.indoor && checks.capacity && checks.equipment && checks.availability;
      if (eligible) {
        reasons.push(
          `Fits ${event.attendees} of ${venue.capacity} seats`,
          "Has all required equipment",
          "Free for the full event slot",
        );
      }
      return { venue, eligible, checks, missingEquipment, conflict, reasons };
    });
}

export interface Proposal {
  id: string;
  eventId: string;
  fromVenueId: string;
  toVenueId: string;
  rationale: string[];
  evaluations: VenueEvaluation[];
}

export const proposalId = (eventId: string, from: string, to: string) =>
  `${eventId}:${from}->${to}`;

/** Deterministic: smallest eligible venue that still fits (least wasted capacity), then by name. */
export function buildProposal(s: DemoState, eventId: string): Proposal | null {
  const event = getEvent(s, eventId);
  if (!event || event.status === "cancelled" || event.risk?.status !== "active") return null;
  const evaluations = evaluateVenues(s, event);
  const best = evaluations
    .filter((e) => e.eligible)
    .sort(
      (a, b) => a.venue.capacity - b.venue.capacity || a.venue.name.localeCompare(b.venue.name),
    )[0];
  if (!best) return null;
  return {
    id: proposalId(event.id, event.venueId, best.venue.id),
    eventId: event.id,
    fromVenueId: event.venueId,
    toVenueId: best.venue.id,
    rationale: [
      `Indoor setting protects against simulated ${event.risk.title.toLowerCase()} disruptions`,
      ...best.reasons,
      "Smallest eligible room — least unused capacity",
    ],
    evaluations,
  };
}

export class PlanningError extends Error {}

/** Check if a venue is already booked for an overlapping time slot, excluding a given event. */
export function checkBookingConflict(
  s: DemoState,
  venueId: string,
  start: string,
  end: string,
  excludeEventId?: string,
): Booking | null {
  return (
    s.bookings.find(
      (b) =>
        b.venueId === venueId &&
        b.eventId !== excludeEventId &&
        overlaps(b.start, b.end, start, end),
    ) ?? null
  );
}

export interface EventValidationErrors {
  name?: string | undefined;
  date?: string | undefined;
  startTime?: string | undefined;
  endTime?: string | undefined;
  attendees?: string | undefined;
  venueId?: string | undefined;
  requiredEquipment?: string | undefined;
}

/** Validate event form input against business rules, capacity, equipment, and scheduling. */
export function validateEventInput(
  s: DemoState,
  input: EventFormData,
  currentEventId?: string,
): { valid: boolean; errors: EventValidationErrors } {
  const errors: EventValidationErrors = {};

  if (!input.name || !input.name.trim()) {
    errors.name = "Event name is required.";
  }

  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    errors.date = "A valid event date (YYYY-MM-DD) is required.";
  }

  if (!input.startTime || !/^\d{2}:\d{2}$/.test(input.startTime)) {
    errors.startTime = "Valid start time (HH:MM) is required.";
  }

  if (!input.endTime || !/^\d{2}:\d{2}$/.test(input.endTime)) {
    errors.endTime = "Valid end time (HH:MM) is required.";
  }

  if (input.date && input.startTime && input.endTime) {
    const startMs = toMs(`${input.date}T${input.startTime}:00`);
    const endMs = toMs(`${input.date}T${input.endTime}:00`);
    if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
      errors.endTime = "End time must be strictly after start time.";
    }
  }

  if (
    typeof input.attendees !== "number" ||
    isNaN(input.attendees) ||
    input.attendees < 1 ||
    Math.floor(input.attendees) !== input.attendees
  ) {
    errors.attendees = "Attendees must be a positive integer (at least 1).";
  }

  const venue = s.venues.find((v) => v.id === input.venueId);
  if (!input.venueId || !venue) {
    errors.venueId = "Please select an existing venue.";
  } else {
    // Venue capacity check
    if (typeof input.attendees === "number" && input.attendees > venue.capacity) {
      errors.venueId = `${venue.name} has a capacity of ${venue.capacity} seats (${input.attendees} attendees requested).`;
    }

    // Required equipment check
    if (input.requiredEquipment && input.requiredEquipment.length > 0) {
      const missing = input.requiredEquipment.filter((eq) => !venue.equipment.includes(eq));
      if (missing.length > 0) {
        errors.requiredEquipment = `${venue.name} is missing required equipment: ${missing.map((e) => EQUIPMENT_LABEL[e]).join(", ")}.`;
      }
    }

    // Booking conflict check
    if (input.date && input.startTime && input.endTime && !errors.endTime) {
      const startIso = `${input.date}T${input.startTime}:00`;
      const endIso = `${input.date}T${input.endTime}:00`;
      const conflict = checkBookingConflict(s, venue.id, startIso, endIso, currentEventId);
      if (conflict) {
        errors.venueId = `${venue.name} is already booked by "${conflict.holder}" from ${fmtTime(conflict.start)} to ${fmtTime(conflict.end)}.`;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/** Stable slug generator preventing duplicate event IDs */
export function generateEventId(name: string, existingIds: string[]): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "event";
  let candidate = base;
  let counter = 1;
  while (existingIds.includes(candidate)) {
    candidate = `${base}-${counter}`;
    counter++;
  }
  return candidate;
}

/** Create a new event with its associated booking and activity record. */
export function createEvent(
  s: DemoState,
  input: EventFormData,
  at: string = nowLocal(),
): { state: DemoState; event: PlanEvent } {
  const { valid, errors } = validateEventInput(s, input);
  if (!valid) {
    const firstErr = Object.values(errors)[0] ?? "Invalid event input";
    throw new PlanningError(firstErr);
  }

  const eventId = generateEventId(
    input.name,
    s.events.map((e) => e.id),
  );
  const start = `${input.date}T${input.startTime}:00`;
  const end = `${input.date}T${input.endTime}:00`;
  const bookingId = `bk-${eventId}`;

  const booking: Booking = {
    id: bookingId,
    venueId: input.venueId,
    eventId,
    holder: input.name.trim(),
    start,
    end,
  };

  const risk: Risk | null = input.simulateRisk
    ? {
        kind: "heavy-rain",
        title: "Heavy rain during event window",
        detail:
          input.riskDetail?.trim() ||
          "Sustained heavy rain expected during the event slot. Outdoor seating and equipment would be exposed.",
        source: "Simulated scenario",
        probability: input.riskProbability ?? 85,
        window: input.riskWindow?.trim() || `${input.startTime} – ${input.endTime}`,
        status: "active",
      }
    : null;

  const event: PlanEvent = {
    id: eventId,
    name: input.name.trim(),
    description: input.description?.trim(),
    organizer: input.organizer?.trim() || "Event Organizer",
    start,
    end,
    attendees: input.attendees,
    venueId: input.venueId,
    bookingId,
    requiredEquipment: [...input.requiredEquipment],
    schedule:
      input.schedule && input.schedule.length > 0
        ? input.schedule
        : [
            { time: input.startTime, item: "Opening & welcome" },
            { time: input.endTime, item: "Wrap-up & closing" },
          ],
    risk,
    status: "scheduled",
    location: input.location,
    weatherMode: input.weatherMode ?? (risk ? "simulated" : undefined),
  };

  const venue = getVenue(s, input.venueId);
  const decision: Decision = {
    id: `d-${s.decisions.length + 1}-${toMs(at)}`,
    eventId,
    eventName: event.name,
    proposalId: `created:${eventId}`,
    outcome: "created",
    fromVenueId: input.venueId,
    toVenueId: input.venueId,
    at,
    explanation: `Event created and assigned to ${venue?.name ?? "venue"} for ${event.attendees} attendees.`,
  };

  return {
    state: {
      ...s,
      events: [...s.events, event],
      bookings: [...s.bookings, booking],
      decisions: [...s.decisions, decision],
    },
    event,
  };
}

/** Update an existing event, updating its booking and recording an activity log entry. */
export function updateEvent(
  s: DemoState,
  eventId: string,
  input: EventFormData,
  at: string = nowLocal(),
): { state: DemoState; event: PlanEvent } {
  const existing = getEvent(s, eventId);
  if (!existing) {
    throw new PlanningError(`Event "${eventId}" not found.`);
  }

  const { valid, errors } = validateEventInput(s, input, eventId);
  if (!valid) {
    const firstErr = Object.values(errors)[0] ?? "Invalid event input";
    throw new PlanningError(firstErr);
  }

  const start = `${input.date}T${input.startTime}:00`;
  const end = `${input.date}T${input.endTime}:00`;

  let risk: Risk | null = existing.risk;
  if (input.simulateRisk) {
    risk = {
      kind: "heavy-rain",
      title: "Heavy rain during event window",
      detail:
        input.riskDetail?.trim() ||
        existing.risk?.detail ||
        "Sustained heavy rain expected during the event slot. Outdoor seating and equipment would be exposed.",
      source: "Simulated scenario",
      probability: input.riskProbability ?? existing.risk?.probability ?? 85,
      window:
        input.riskWindow?.trim() ||
        existing.risk?.window ||
        `${input.startTime} – ${input.endTime}`,
      status: existing.risk?.status ?? "active",
    };
  } else {
    risk = null;
  }

  const updatedEvent: PlanEvent = {
    ...existing,
    name: input.name.trim(),
    description: input.description?.trim(),
    organizer: input.organizer?.trim() || existing.organizer,
    start,
    end,
    attendees: input.attendees,
    venueId: input.venueId,
    requiredEquipment: [...input.requiredEquipment],
    risk,
    location: input.location !== undefined ? input.location : existing.location,
    weatherMode: input.weatherMode !== undefined ? input.weatherMode : existing.weatherMode,
  };

  // Update or reassign the event's booking
  const updatedBookings = s.bookings.map((b) =>
    b.id === existing.bookingId || (b.eventId === eventId && b.venueId === existing.venueId)
      ? {
          ...b,
          venueId: input.venueId,
          holder: input.name.trim(),
          start,
          end,
        }
      : b,
  );

  const fromV = getVenue(s, existing.venueId);
  const toV = getVenue(s, input.venueId);
  const decision: Decision = {
    id: `d-${s.decisions.length + 1}-${toMs(at)}`,
    eventId,
    eventName: updatedEvent.name,
    proposalId: `updated:${eventId}`,
    outcome: "updated",
    fromVenueId: existing.venueId,
    toVenueId: input.venueId,
    at,
    explanation:
      existing.venueId !== input.venueId
        ? `Reassigned venue from ${fromV?.name} to ${toV?.name}. Updated schedule: ${fmtDay(start)}, ${fmtTime(start)}–${fmtTime(end)}.`
        : `Updated schedule and details: ${fmtDay(start)}, ${fmtTime(start)}–${fmtTime(end)} at ${toV?.name}.`,
  };

  return {
    state: {
      ...s,
      events: s.events.map((e) => (e.id === eventId ? updatedEvent : e)),
      bookings: updatedBookings,
      decisions: [...s.decisions, decision],
    },
    event: updatedEvent,
  };
}

/** Cancel an event, release its venue booking, and log the action. */
export function cancelEvent(s: DemoState, eventId: string, at: string = nowLocal()): DemoState {
  const existing = getEvent(s, eventId);
  if (!existing) {
    throw new PlanningError(`Event "${eventId}" not found.`);
  }

  if (existing.status === "cancelled") {
    return s;
  }

  const venue = getVenue(s, existing.venueId);
  const updatedEvent: PlanEvent = {
    ...existing,
    status: "cancelled",
    risk: existing.risk ? { ...existing.risk, status: "handled" } : null,
  };

  // Release booking
  const updatedBookings = s.bookings.filter(
    (b) => b.id !== existing.bookingId && b.eventId !== eventId,
  );

  const decision: Decision = {
    id: `d-${s.decisions.length + 1}-${toMs(at)}`,
    eventId,
    eventName: existing.name,
    proposalId: `cancelled:${eventId}`,
    outcome: "cancelled",
    fromVenueId: existing.venueId,
    toVenueId: existing.venueId,
    at,
    explanation: `Event cancelled by organizer. Simulated reservation at ${venue?.name ?? "venue"} released.`,
  };

  return {
    ...s,
    events: s.events.map((e) => (e.id === eventId ? updatedEvent : e)),
    bookings: updatedBookings,
    decisions: [...s.decisions, decision],
  };
}

/** Delete an event completely, removing its booking and retaining historical decisions safely. */
export function deleteEvent(s: DemoState, eventId: string): DemoState {
  const existing = getEvent(s, eventId);
  if (!existing) {
    return s;
  }

  // Preserve historical decisions by ensuring eventName is populated
  const updatedDecisions = s.decisions.map((d) =>
    d.eventId === eventId ? { ...d, eventName: d.eventName || existing.name } : d,
  );

  return {
    ...s,
    events: s.events.filter((e) => e.id !== eventId),
    bookings: s.bookings.filter((b) => b.id !== existing.bookingId && b.eventId !== eventId),
    decisions: updatedDecisions,
    approvedProposalIds: s.approvedProposalIds.filter((pId) => !pId.startsWith(`${eventId}:`)),
  };
}

/** Atomically move the event to the proposed venue. Returns a new state; never mutates. */
export function approveProposal(s: DemoState, id: string, at: string): DemoState {
  if (s.approvedProposalIds.includes(id))
    throw new PlanningError("This proposal was already approved.");
  const current = s.events.map((e) => buildProposal(s, e.id)).find((p) => p?.id === id);
  if (!current) throw new PlanningError("This proposal is no longer valid.");
  const to = getVenue(s, current.toVenueId)!;
  const from = getVenue(s, current.fromVenueId)!;
  const event = getEvent(s, current.eventId)!;
  const decision: Decision = {
    id: `d-${s.decisions.length + 1}-${toMs(at)}`,
    eventId: event.id,
    eventName: event.name,
    proposalId: id,
    outcome: "approved",
    fromVenueId: from.id,
    toVenueId: to.id,
    at,
    explanation: `Approved relocation from ${from.name} to ${to.name}. Simulated booking assignment updated in demo state: ${from.name} slot released, ${to.name} assigned ${fmtTime(event.start)}–${fmtTime(event.end)} for ${event.attendees} attendees.`,
  };
  return {
    ...s,
    bookings: s.bookings.map((b) => (b.id === event.bookingId ? { ...b, venueId: to.id } : b)),
    events: s.events.map((e) =>
      e.id === event.id
        ? { ...e, venueId: to.id, risk: e.risk ? { ...e.risk, status: "handled" } : null }
        : e,
    ),
    decisions: [...s.decisions, decision],
    approvedProposalIds: [...s.approvedProposalIds, id],
  };
}

/** Records the rejection only. Event and bookings are untouched. */
export function rejectProposal(s: DemoState, id: string, at: string): DemoState {
  const p = s.events.map((e) => buildProposal(s, e.id)).find((x) => x?.id === id);
  if (!p) throw new PlanningError("This proposal is no longer valid.");
  const from = getVenue(s, p.fromVenueId)!;
  const to = getVenue(s, p.toVenueId)!;
  const ev = getEvent(s, p.eventId);
  return {
    ...s,
    decisions: [
      ...s.decisions,
      {
        id: `d-${s.decisions.length + 1}-${toMs(at)}`,
        eventId: p.eventId,
        eventName: ev?.name,
        proposalId: id,
        outcome: "rejected",
        fromVenueId: from.id,
        toVenueId: to.id,
        at,
        explanation: `Kept at ${from.name}. Move to ${to.name} was declined by operator; demo state unchanged and simulated risk remains open.`,
      },
    ],
  };
}

// ---------- Overview metrics ----------
export function overviewMetrics(s: DemoState, asOf: string = DEMO_TODAY) {
  const upcoming = s.events
    .filter((e) => e.status !== "cancelled" && toMs(e.end) >= toMs(asOf))
    .sort((a, b) => toMs(a.start) - toMs(b.start));
  const atRisk = upcoming.filter((e) => e.risk?.status === "active");
  const focus = atRisk[0] ?? null;
  const suitable = focus ? evaluateVenues(s, focus).filter((e) => e.eligible).length : 0;
  return { upcoming, atRisk, focus, suitable };
}

// ---------- Intents ----------
export type Intent =
  "check_risk" | "find_alternative" | "show_plan" | "approve_guidance" | "unsupported";

/**
 * Normalizes voice-style invocation phrases such as:
 * "Alexa, ask Planzo to find a safer venue" -> "find a safer venue"
 * "Alexa, ask Planzo what's happening with TechFest" -> "what's happening with TechFest"
 * "Ask Planzo why Seminar Hall B won't work" -> "why Seminar Hall B won't work"
 */
export function normalizeVoiceQuery(text: string): string {
  return text
    .replace(/^\s*(?:alexa\s*[,:]?\s*)?(?:ask|tell)\s+planzo\s+(?:to\s+|about\s+|for\s+)?/i, "")
    .replace(/^\s*alexa\s*[,:]?\s*/i, "")
    .trim();
}

export function parseIntent(text: string): Intent {
  const t = normalizeVoiceQuery(text).toLowerCase();

  // 1. Safety Guardrail: Intercept approval, confirmation, execution, or rejection guidance first
  if (
    /\b(approve|approval|approving|confirm|confirmation|confirming|accept|acceptance|accepting|execute|executing|apply|applying|reject|rejection|rejecting|decline|declining)\b/i.test(
      t,
    ) ||
    /\b(go\s+ahead\s+and\s+(?:move|switch|relocate)|proceed\s+with\s+(?:the\s+)?(?:move|switch|relocation))\b/i.test(
      t,
    )
  ) {
    return "approve_guidance";
  }

  // 2. Alternative Venue search & evaluation:
  // Evaluated before check_risk so queries like "Find an alternative because of the rain" or
  // "Find a safer venue" trigger alternative discovery rather than basic risk check.
  // Must NOT use substring 'work' (e.g. Workshop) or hardcoded venue names (e.g. Seminar Hall).
  if (
    /\b(alternative|alternatives|alternate|backup|relocate|relocation|relocating|safer\s+venue|another\s+venue|new\s+venue|different\s+venue|switch\s+venue|change\s+venue|indoor\s+venue|other\s+venue)\b/i.test(
      t,
    ) ||
    /\b(find|search|look\s+for|suggest|recommend|need)\b.*\b(venue|room|hall|space|alternative)\b/i.test(
      t,
    ) ||
    /\b(find|look\s+for|search\s+for)\s+(a\s+)?safer\b/i.test(t) ||
    /\b(why\s+(?:won'?t|can'?t|doesn'?t|not|wouldn'?t))\b/i.test(t) ||
    /\b(won'?t\s+work|doesn'?t\s+work|can'?t\s+use|will\s+not\s+work|not\s+work|not\s+suitable|ineligible|unfit|suitability)\b/i.test(
      t,
    ) ||
    /\b(switch|move)\s+to\b/i.test(t) ||
    /\bwhy\s+.*\b(?:work|fit|suit|eligible)\b/i.test(t) ||
    /\b(eligible\s+venues?|available\s+venues?)\b/i.test(t)
  ) {
    return "find_alternative";
  }

  // 3. Risk & Disruption checking: Queries about weather threats, risks, disruption status, what's happening
  // Uses word boundaries so "Workshop" does NOT trigger "work"
  if (
    /\b(risk|risks|weather|rain|raining|threat|threats|disrupt|disruption|forecast|wrong|happening|status|problem|problems|issue|issues|alert|alerts|hazard|danger)\b/i.test(
      t,
    )
  ) {
    return "check_risk";
  }

  // 4. Schedule, Plan, Attendees, Recovery details
  if (
    /\b(plan|plans|recovery\s+plan|schedule|scheduled|scheduling|summary|details|detail|overview|agenda|attendee|attendees|how\s+many)\b/i.test(
      t,
    ) ||
    /^(?:show|display|view)\b/i.test(t)
  ) {
    return "show_plan";
  }

  return "unsupported";
}

export interface AssistantReply {
  intent: Intent;
  text: string;
  showProposal: boolean;
}

export function replyFor(s: DemoState, eventId: string, intent: Intent): AssistantReply {
  const event = getEvent(s, eventId)!;
  if (!event || event.status === "cancelled") {
    return {
      intent,
      showProposal: false,
      text: `${event?.name ?? "This event"} was cancelled. There is no active venue booking or disruption scenario.`,
    };
  }
  const venue = getVenue(s, event.venueId)!;
  const risk = event.risk;
  const active = risk?.status === "active";
  switch (intent) {
    case "check_risk": {
      if (!risk)
        return {
          intent,
          showProposal: false,
          text: `No disruption is recorded for ${event.name}. It stays at ${venue.name}, ${fmtTime(event.start)}–${fmtTime(event.end)}.`,
        };
      const sourceLabel =
        risk.source === "Forecast from Open-Meteo"
          ? "forecast from Open-Meteo"
          : "simulated scenario";
      if (!active)
        return {
          intent,
          showProposal: false,
          text: `The ${sourceLabel} (${risk.title.toLowerCase()}) was addressed by operator approval. ${event.name} is assigned to ${venue.name} (${venue.indoor ? "indoor" : "outdoor"}) in demo state.`,
        };
      const equipmentText =
        event.requiredEquipment.length > 0
          ? ` and the ${event.requiredEquipment.map((e) => EQUIPMENT_LABEL[e].toLowerCase()).join(", ")} setup are exposed`
          : " are exposed";
      return {
        intent,
        showProposal: false,
        text: `${risk.title} — ${risk.probability}% (${sourceLabel}), ${risk.window}. ${venue.name} is ${venue.indoor ? "indoor" : "outdoor"}, so ${event.attendees} attendees${equipmentText}. Ask me to find an alternative.`,
      };
    }
    case "find_alternative": {
      if (!active)
        return {
          intent,
          showProposal: false,
          text: risk
            ? `Nothing to change: the simulated risk for ${event.name} is already addressed by operator approval and it is booked in ${venue.name}.`
            : `${event.name} has no active disruption, so no alternative is needed.`,
        };
      const p = buildProposal(s, eventId);
      if (!p) {
        const evals = evaluateVenues(s, event);
        const reasonsList = evals
          .map((ev) => `• ${ev.venue.name}: ${ev.reasons.join(", ")}`)
          .join("\n");
        return {
          intent,
          showProposal: false,
          text: `I evaluated all other campus venues for ${event.name} (${event.attendees} attendees), but no indoor alternative qualifies:\n\n${reasonsList}\n\nNo eligible venue can be proposed. Consider adjusting the attendee capacity or scheduling window.`,
        };
      }
      const to = getVenue(s, p.toVenueId)!;
      const excluded = p.evaluations.filter((e) => !e.eligible).length;
      return {
        intent,
        showProposal: true,
        text: `Recommend moving to ${to.name}: indoor, ${to.capacity} seats for ${event.attendees} attendees, has all required equipment, and is free ${fmtTime(event.start)}–${fmtTime(event.end)}. ${excluded} other venue${excluded === 1 ? " was" : "s were"} excluded — see the evidence below. Note: operator approval is required to confirm.`,
      };
    }
    case "show_plan":
      return {
        intent,
        showProposal: active && !!buildProposal(s, eventId),
        text: `${event.name}: ${fmtDay(event.start)}, ${fmtTime(event.start)}–${fmtTime(event.end)} at ${venue.name}. ${event.attendees} attendees; needs ${event.requiredEquipment.map((e) => EQUIPMENT_LABEL[e].toLowerCase()).join(", ")}. ${active ? "Status: at risk, decision pending." : "Status: on track."}`,
      };
    case "approve_guidance":
      return {
        intent,
        showProposal: active && !!buildProposal(s, eventId),
        text: `To ensure operational safety, booking changes cannot be executed conversationally. Please review the proposal details below and click the explicit "Approve" button to confirm.`,
      };
    default:
      return {
        intent,
        showProposal: false,
        text: `This prototype handles event disruption planning only. Try "check risk", "find an alternative" or "show plan".`,
      };
  }
}

// ---------- Formatting (timezone-free, deterministic for SSR) ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function fmtTime(t?: string | null) {
  if (!t || typeof t !== "string") return "";
  return t.length >= 16 ? t.slice(11, 16) : t;
}

export function fmtDay(t?: string | null) {
  if (!t || typeof t !== "string" || t.length < 10) return "";
  const year = Number(t.slice(0, 4));
  const month = Number(t.slice(5, 7));
  const day = Number(t.slice(8, 10));

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12) return t;

  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return `${DAYS[dow]}, ${MONTHS[month - 1]} ${day}`;
}

export function fmtShortDate(t?: string | null) {
  if (!t || typeof t !== "string" || t.length < 10) {
    return { month: "", day: 0 };
  }
  const month = Number(t.slice(5, 7));
  const day = Number(t.slice(8, 10));

  return {
    month: month >= 1 && month <= 12 ? MONTHS[month - 1] : "",
    day: isNaN(day) ? 0 : day,
  };
}

export function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------- Attendee Communication Draft (M4) ----------
export interface AttendeeAnnouncement {
  subject: string;
  body: string;
  fullText: string;
}

export function buildAttendeeAnnouncement(
  event: PlanEvent,
  fromVenueName: string,
  toVenueName: string,
): AttendeeAnnouncement {
  const contingencyReason =
    event.risk?.kind === "heavy-rain"
      ? "simulated heavy-rain contingency"
      : event.risk?.title
        ? `simulated ${event.risk.title.toLowerCase()} contingency`
        : "simulated weather contingency";

  const activityName = event.name.toLowerCase().includes("workshop") ? "the workshop" : event.name;
  const dateStr = fmtDay(event.start);
  const timeStr = `${fmtTime(event.start)}–${fmtTime(event.end)}`;

  const subject = `Important Venue Update — ${event.name}`;
  const body = `Hello attendees,

Due to a ${contingencyReason}, the ${event.name} has been relocated from ${fromVenueName} to ${toVenueName}.

The event date and time remain unchanged.
Date: ${dateStr}
Time: ${timeStr}
Location: ${toVenueName} (previously ${fromVenueName})

Please proceed to ${toVenueName} for ${activityName}.

[Draft — not sent. Internal simulated contingency announcement for organizer review.]

Thank you,
Event Operations Team`;

  const fullText = `Subject: ${subject}\n\n${body}`;

  return { subject, body, fullText };
}

export function getEventRecoveryDecision(state: DemoState, eventId: string): Decision | undefined {
  return state.decisions.filter((d) => d.eventId === eventId && d.outcome === "approved").at(-1);
}

// ---------- Venue Management (P6C) ----------

export function validateVenueInput(
  s: DemoState,
  input: VenueFormData,
  currentVenueId?: string,
): { valid: boolean; errors: VenueValidationErrors } {
  const errors: VenueValidationErrors = {};

  if (!input.name || !input.name.trim() || input.name.trim().length < 2) {
    errors.name = "Venue name must be at least 2 characters.";
  }

  if (
    typeof input.capacity !== "number" ||
    isNaN(input.capacity) ||
    input.capacity < 1 ||
    Math.floor(input.capacity) !== input.capacity
  ) {
    errors.capacity = "Capacity must be a positive integer (at least 1 seat).";
  }

  // Name uniqueness check
  const duplicate = s.venues.find(
    (v) =>
      v.name.toLowerCase().trim() === input.name.toLowerCase().trim() && v.id !== currentVenueId,
  );
  if (duplicate) {
    errors.name = `A venue named "${duplicate.name}" already exists.`;
  }

  // Safety checks if editing existing venue:
  if (currentVenueId) {
    // 1. Check if capacity reduction breaks any active event booking
    const activeEventsInVenue = s.events.filter(
      (e) => e.venueId === currentVenueId && e.status !== "cancelled",
    );
    const brokenCapacityEvent = activeEventsInVenue.find(
      (e) => typeof input.capacity === "number" && e.attendees > input.capacity,
    );
    if (brokenCapacityEvent) {
      errors.capacity = `Cannot reduce capacity to ${input.capacity}: "${brokenCapacityEvent.name}" is scheduled here with ${brokenCapacityEvent.attendees} attendees.`;
    }

    // 2. Check if removing required equipment breaks any active event booking
    const brokenEquipmentEvent = activeEventsInVenue.find((e) =>
      e.requiredEquipment.some((eq) => !input.equipment.includes(eq)),
    );
    if (brokenEquipmentEvent) {
      const missing = brokenEquipmentEvent.requiredEquipment.filter(
        (eq) => !input.equipment.includes(eq),
      );
      errors.equipment = `Cannot remove equipment (${missing.map((eq) => EQUIPMENT_LABEL[eq]).join(", ")}): Required by scheduled event "${brokenEquipmentEvent.name}".`;
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function generateVenueId(name: string, existingIds: string[]): string {
  const base =
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "venue";
  let candidate = base;
  let counter = 1;
  while (existingIds.includes(candidate)) {
    candidate = `${base}-${counter}`;
    counter++;
  }
  return candidate;
}

export function createVenue(
  s: DemoState,
  input: VenueFormData,
  at: string = nowLocal(),
): { state: DemoState; venue: Venue } {
  const { valid, errors } = validateVenueInput(s, input);
  if (!valid) {
    const firstErr = Object.values(errors)[0] ?? "Invalid venue input";
    throw new PlanningError(firstErr);
  }

  const id = generateVenueId(
    input.name,
    s.venues.map((v) => v.id),
  );
  const venue: Venue = {
    id,
    name: input.name.trim(),
    building: input.building?.trim() || "Main Campus",
    indoor: Boolean(input.indoor),
    capacity: input.capacity,
    equipment: [...input.equipment],
    notes: input.notes?.trim() || undefined,
  };

  const decision: Decision = {
    id: `d-${s.decisions.length + 1}-${toMs(at)}`,
    eventId: "",
    eventName: venue.name,
    proposalId: `created-venue:${id}`,
    outcome: "venue_created",
    fromVenueId: id,
    toVenueId: id,
    at,
    explanation: `Added new venue "${venue.name}" (${venue.indoor ? "Indoor" : "Outdoor"}, ${venue.capacity} seats, ${venue.building}).`,
  };

  return {
    state: {
      ...s,
      venues: [...s.venues, venue],
      decisions: [...s.decisions, decision],
    },
    venue,
  };
}

export function updateVenue(
  s: DemoState,
  venueId: string,
  input: VenueFormData,
  at: string = nowLocal(),
): { state: DemoState; venue: Venue } {
  const existing = getVenue(s, venueId);
  if (!existing) {
    throw new PlanningError(`Venue "${venueId}" not found.`);
  }

  const { valid, errors } = validateVenueInput(s, input, venueId);
  if (!valid) {
    const firstErr = Object.values(errors)[0] ?? "Invalid venue update";
    throw new PlanningError(firstErr);
  }

  const updatedVenue: Venue = {
    id: venueId,
    name: input.name.trim(),
    building: input.building?.trim() || existing.building,
    indoor: Boolean(input.indoor),
    capacity: input.capacity,
    equipment: [...input.equipment],
    notes: input.notes?.trim() || undefined,
  };

  const decision: Decision = {
    id: `d-${s.decisions.length + 1}-${toMs(at)}`,
    eventId: "",
    eventName: updatedVenue.name,
    proposalId: `updated-venue:${venueId}`,
    outcome: "venue_updated",
    fromVenueId: venueId,
    toVenueId: venueId,
    at,
    explanation: `Updated venue "${updatedVenue.name}" (Capacity: ${updatedVenue.capacity}, ${updatedVenue.indoor ? "Indoor" : "Outdoor"}).`,
  };

  return {
    state: {
      ...s,
      venues: s.venues.map((v) => (v.id === venueId ? updatedVenue : v)),
      decisions: [...s.decisions, decision],
    },
    venue: updatedVenue,
  };
}

export function deleteVenue(s: DemoState, venueId: string, at: string = nowLocal()): DemoState {
  const existing = getVenue(s, venueId);
  if (!existing) return s;

  // Safety check: Cannot delete if bookings exist for this venue
  const hasBookings = s.bookings.some((b) => b.venueId === venueId);
  if (hasBookings) {
    throw new PlanningError(
      `Cannot delete "${existing.name}" because it has active reservations or bookings. Reassign or cancel affected events first.`,
    );
  }

  // Safety check: Cannot delete if any active event is scheduled here
  const activeEvent = s.events.find((e) => e.venueId === venueId && e.status !== "cancelled");
  if (activeEvent) {
    throw new PlanningError(
      `Cannot delete "${existing.name}" because event "${activeEvent.name}" is scheduled in this venue.`,
    );
  }

  const decision: Decision = {
    id: `d-${s.decisions.length + 1}-${toMs(at)}`,
    eventId: "",
    eventName: existing.name,
    proposalId: `deleted-venue:${venueId}`,
    outcome: "venue_deleted",
    fromVenueId: venueId,
    toVenueId: venueId,
    at,
    explanation: `Removed venue "${existing.name}".`,
  };

  return {
    ...s,
    venues: s.venues.filter((v) => v.id !== venueId),
    decisions: [...s.decisions, decision],
  };
}

export function getVenueBookings(s: DemoState, venueId: string): Booking[] {
  return s.bookings.filter((b) => b.venueId === venueId);
}

export function setEventWeatherRisk(
  s: DemoState,
  eventId: string,
  risk: Risk | null,
  weatherMode?: "simulated" | "forecast",
  at: string = nowLocal(),
): DemoState {
  const existing = getEvent(s, eventId);
  if (!existing) {
    throw new PlanningError(`Event "${eventId}" not found.`);
  }

  const mode =
    weatherMode ?? (risk?.source === "Forecast from Open-Meteo" ? "forecast" : "simulated");

  const updatedEvent: PlanEvent = {
    ...existing,
    risk,
    weatherMode: mode,
  };

  const decision: Decision = {
    id: `d-${s.decisions.length + 1}-${toMs(at)}`,
    eventId,
    eventName: existing.name,
    proposalId: `risk-update:${eventId}`,
    outcome: risk ? "risk_updated" : "risk_dismissed",
    fromVenueId: existing.venueId,
    toVenueId: existing.venueId,
    at,
    explanation: risk
      ? `Disruption activated (${risk.source}): ${risk.title} (${risk.probability}%).`
      : `Disruption dismissed by organizer. Event is marked clear of active risks.`,
  };

  return {
    ...s,
    events: s.events.map((e) => (e.id === eventId ? updatedEvent : e)),
    decisions: [...s.decisions, decision],
  };
}

export function setEventLocation(
  s: DemoState,
  eventId: string,
  location: GeoLocation | undefined,
): DemoState {
  const existing = getEvent(s, eventId);
  if (!existing) {
    throw new PlanningError(`Event "${eventId}" not found.`);
  }

  const updatedEvent: PlanEvent = {
    ...existing,
    location,
  };

  return {
    ...s,
    events: s.events.map((e) => (e.id === eventId ? updatedEvent : e)),
  };
}

// ---------- Live Weather Risk Evaluator (P6C) ----------

export interface HourlyForecastData {
  time: string[];
  precipitation_probability: (number | null)[];
  precipitation: (number | null)[];
  rain: (number | null)[];
  wind_speed_10m: (number | null)[];
  temperature_2m?: (number | null)[];
  weather_code?: (number | null)[];
}

export interface LiveWeatherAssessment {
  canForecast: boolean;
  reason?: string;
  maxPrecipitationProbability: number;
  totalRainMm: number;
  maxWindSpeedKmh: number;
  risk: Risk | null;
}

export function evaluateLiveWeatherRisk(
  forecast: HourlyForecastData,
  event: PlanEvent,
  venue: Venue | undefined,
  fetchedAt: string = nowLocal(),
): LiveWeatherAssessment {
  if (!forecast || !forecast.time || forecast.time.length === 0) {
    return {
      canForecast: false,
      reason: "No forecast data points available.",
      maxPrecipitationProbability: 0,
      totalRainMm: 0,
      maxWindSpeedKmh: 0,
      risk: null,
    };
  }

  const startMs = toMs(event.start);
  const endMs = toMs(event.end);

  // Match forecast hourly indices within event window
  const matchingIndices: number[] = [];
  for (let i = 0; i < forecast.time.length; i++) {
    const pt = forecast.time[i];
    const ptMs = toMs(pt ?? "");
    // Check if point falls within event window (or within 30 min buffer)
    if (!isNaN(ptMs) && ptMs >= startMs - 1800000 && ptMs <= endMs + 1800000) {
      matchingIndices.push(i);
    }
  }

  if (matchingIndices.length === 0) {
    return {
      canForecast: false,
      reason: "Event window outside available hourly forecast points.",
      maxPrecipitationProbability: 0,
      totalRainMm: 0,
      maxWindSpeedKmh: 0,
      risk: null,
    };
  }

  let maxProb = 0;
  let rainSum = 0;
  let maxWind = 0;

  for (const idx of matchingIndices) {
    const prob = forecast.precipitation_probability[idx];
    if (typeof prob === "number" && prob > maxProb) maxProb = prob;

    const rain = forecast.rain[idx] ?? forecast.precipitation[idx];
    if (typeof rain === "number") rainSum += rain;

    const wind = forecast.wind_speed_10m[idx];
    if (typeof wind === "number" && wind > maxWind) maxWind = wind;
  }

  rainSum = Math.round(rainSum * 10) / 10;

  const isOutdoor = venue ? !venue.indoor : true;
  const locationLabel = event.location?.name ?? venue?.name ?? "Event location";

  // Evaluate risk: For outdoor events, rain prob >= 50% or rain >= 1.0mm triggers active risk
  const isHighRainRisk = isOutdoor && (maxProb >= 50 || rainSum >= 1.0);

  let risk: Risk | null = null;
  if (isHighRainRisk) {
    risk = {
      kind: "heavy-rain",
      title:
        maxProb >= 70
          ? "Heavy rain forecast during event window"
          : "Rain showers forecast during event window",
      detail: `Open-Meteo forecast indicates up to ${maxProb}% chance of rain (${rainSum} mm) over ${locationLabel} between ${fmtTime(event.start)} and ${fmtTime(event.end)}. Outdoor setting and AV equipment would be exposed.`,
      source: "Forecast from Open-Meteo",
      probability: maxProb,
      window: `${fmtTime(event.start)} – ${fmtTime(event.end)}`,
      status: "active",
      forecastMetadata: {
        fetchedAt,
        provider: "Open-Meteo",
        precipitationProbabilityMax: maxProb,
        rainSumMm: rainSum,
        windSpeedMaxKmh: maxWind,
        locationName: locationLabel,
      },
    };
  }

  return {
    canForecast: true,
    maxPrecipitationProbability: maxProb,
    totalRainMm: rainSum,
    maxWindSpeedKmh: maxWind,
    risk,
  };
}
