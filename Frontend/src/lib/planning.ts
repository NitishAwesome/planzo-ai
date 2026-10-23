import type { Booking, Decision, DemoState, Equipment, PlanEvent, Venue } from "@/data/types";
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
  if (!event || event.risk?.status !== "active") return null;
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
      `Indoor, so the ${event.risk.title.toLowerCase()} does not affect it`,
      ...best.reasons,
      "Smallest eligible room — least unused capacity",
    ],
    evaluations,
  };
}

export class PlanningError extends Error {}

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
    proposalId: id,
    outcome: "approved",
    fromVenueId: from.id,
    toVenueId: to.id,
    at,
    explanation: `Moved from ${from.name} to ${to.name}. ${from.name} slot released; ${to.name} reserved ${fmtTime(event.start)}–${fmtTime(event.end)} for ${event.attendees} attendees.`,
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
  return {
    ...s,
    decisions: [
      ...s.decisions,
      {
        id: `d-${s.decisions.length + 1}-${toMs(at)}`,
        eventId: p.eventId,
        proposalId: id,
        outcome: "rejected",
        fromVenueId: from.id,
        toVenueId: to.id,
        at,
        explanation: `Kept at ${from.name}. Move to ${to.name} was declined; no bookings changed and the risk remains open.`,
      },
    ],
  };
}

// ---------- Overview metrics ----------
export function overviewMetrics(s: DemoState) {
  const upcoming = s.events.filter((e) => toMs(e.end) >= toMs(DEMO_TODAY));
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
  if (
    /(alternative|alternate|another venue|backup|relocat|move|contingency|find|safer venue|indoor|switch|seminar hall|venue|eligible|won't work|work)/.test(
      t,
    )
  )
    return "find_alternative";
  if (
    /(risk|weather|rain|threat|disrupt|forecast|wrong|happening|status|problem|issue|alert)/.test(t)
  )
    return "check_risk";
  if (/(plan|schedule|summary|details|show|attendee|how many)/.test(t)) return "show_plan";
  if (/(approve|accept|confirm|execute|apply)/.test(t)) return "approve_guidance";
  return "unsupported";
}

export interface AssistantReply {
  intent: Intent;
  text: string;
  showProposal: boolean;
}

export function replyFor(s: DemoState, eventId: string, intent: Intent): AssistantReply {
  const event = getEvent(s, eventId)!;
  const venue = getVenue(s, event.venueId)!;
  const risk = event.risk;
  const active = risk?.status === "active";
  switch (intent) {
    case "check_risk":
      if (!risk)
        return {
          intent,
          showProposal: false,
          text: `No disruption is recorded for ${event.name}. It stays at ${venue.name}, ${fmtTime(event.start)}–${fmtTime(event.end)}.`,
        };
      if (!active)
        return {
          intent,
          showProposal: false,
          text: `The ${risk.title.toLowerCase()} (simulated scenario) was handled. ${event.name} is now in ${venue.name}, which is indoor.`,
        };
      return {
        intent,
        showProposal: false,
        text: `${risk.title} — ${risk.probability}% in the simulated scenario, ${risk.window}. ${venue.name} is outdoor, so ${event.attendees} attendees and the AV setup are exposed. Ask me to find an alternative.`,
      };
    case "find_alternative": {
      if (!active)
        return {
          intent,
          showProposal: false,
          text: risk
            ? `Nothing to change: the risk for ${event.name} is already handled and it is booked in ${venue.name}.`
            : `${event.name} has no active disruption, so no alternative is needed.`,
        };
      const p = buildProposal(s, eventId);
      if (!p)
        return {
          intent,
          showProposal: false,
          text: `I checked every venue and none is indoor, large enough, equipped and free for this slot. Consider rescheduling.`,
        };
      const to = getVenue(s, p.toVenueId)!;
      const excluded = p.evaluations.filter((e) => !e.eligible).length;
      return {
        intent,
        showProposal: true,
        text: `Recommend moving to ${to.name}: indoor, ${to.capacity} seats for ${event.attendees} attendees, has all required equipment, and is free ${fmtTime(event.start)}–${fmtTime(event.end)}. ${excluded} other venue${excluded === 1 ? " was" : "s were"} excluded — see the evidence below.`,
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
export function fmtTime(t: string) {
  return t.slice(11, 16);
}

export function fmtDay(t: string) {
  const year = Number(t.slice(0, 4));
  const month = Number(t.slice(5, 7));
  const day = Number(t.slice(8, 10));

  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return `${DAYS[dow]}, ${MONTHS[month - 1]} ${day}`;
}

export function fmtShortDate(t: string) {
  const month = Number(t.slice(5, 7));
  const day = Number(t.slice(8, 10));

  return {
    month: MONTHS[month - 1],
    day,
  };
}

export function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
