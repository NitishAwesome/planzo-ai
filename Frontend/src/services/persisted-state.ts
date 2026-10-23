import { z } from "zod";
import type { DemoState } from "@/data/types";

const equipment = z.array(z.enum(["projector", "microphones", "seating"]));
const time = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  .refine((value) => Number.isFinite(Date.parse(value)));
const location = z.object({
  name: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  country: z.string().optional(),
  admin1: z.string().optional(),
  timezone: z.string().optional(),
});
const risk = z.object({
  kind: z.literal("heavy-rain"),
  title: z.string(),
  detail: z.string(),
  source: z.enum(["Simulated scenario", "Forecast from Open-Meteo"]),
  probability: z.number().min(0).max(100),
  window: z.string(),
  status: z.enum(["active", "handled"]),
  forecastMetadata: z
    .object({
      fetchedAt: z.string(),
      provider: z.literal("Open-Meteo"),
      precipitationProbabilityMax: z.number(),
      rainSumMm: z.number(),
      windSpeedMaxKmh: z.number().optional(),
      locationName: z.string(),
    })
    .optional(),
});
const schema = z.object({
  version: z.literal(1),
  resetKey: z.number().optional(),
  venues: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      building: z.string(),
      indoor: z.boolean(),
      capacity: z.number().int().positive(),
      equipment,
      notes: z.string().optional(),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string(),
      description: z.string().optional(),
      organizer: z.string(),
      start: time,
      end: time,
      attendees: z.number().int().positive(),
      venueId: z.string(),
      bookingId: z.string(),
      requiredEquipment: equipment,
      schedule: z.array(z.object({ time: z.string(), item: z.string() })),
      risk: risk.nullable(),
      status: z.enum(["scheduled", "cancelled", "completed"]).optional(),
      location: location.optional(),
      weatherMode: z.enum(["simulated", "forecast"]).optional(),
    }),
  ),
  bookings: z.array(
    z.object({
      id: z.string().min(1),
      venueId: z.string(),
      eventId: z.string().nullable(),
      holder: z.string(),
      start: time,
      end: time,
    }),
  ),
  decisions: z.array(
    z.object({
      id: z.string(),
      eventId: z.string(),
      eventName: z.string().optional(),
      proposalId: z.string(),
      outcome: z.enum([
        "approved",
        "rejected",
        "created",
        "updated",
        "cancelled",
        "venue_created",
        "venue_updated",
        "venue_deleted",
        "risk_updated",
        "risk_dismissed",
      ]),
      fromVenueId: z.string(),
      toVenueId: z.string(),
      at: time,
      explanation: z.string(),
      seeded: z.boolean().optional(),
    }),
  ),
  approvedProposalIds: z.array(z.string()),
});

/** Browser storage is untrusted, including records written by older app versions. */
export function parsePersistedState(value: unknown): DemoState | null {
  const result = schema.safeParse(value);
  if (!result.success) return null;
  const state: DemoState = result.data;
  for (const records of [state.events, state.venues, state.bookings]) {
    if (new Set(records.map((record) => record.id)).size !== records.length) return null;
  }
  for (const event of state.events) {
    const venue = state.venues.find((v) => v.id === event.venueId);
    if (event.status === "cancelled") continue;
    if (!venue || venue.capacity < event.attendees || event.start >= event.end) return null;
    if (event.requiredEquipment.some((item) => !venue.equipment.includes(item))) return null;
    const bookings = state.bookings.filter((b) => b.eventId === event.id);
    if (bookings.length !== 1) return null;
    const booking = bookings[0]!;
    if (
      booking.id !== event.bookingId ||
      booking.venueId !== event.venueId ||
      booking.start !== event.start ||
      booking.end !== event.end
    )
      return null;
  }
  for (const booking of state.bookings) {
    if (!state.venues.some((v) => v.id === booking.venueId) || booking.start >= booking.end)
      return null;
    if (
      booking.eventId &&
      !state.events.some((e) => e.id === booking.eventId && e.status !== "cancelled")
    )
      return null;
  }
  return state;
}
