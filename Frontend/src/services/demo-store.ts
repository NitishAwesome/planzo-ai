import { useSyncExternalStore } from "react";
import type {
  DemoState,
  EventFormData,
  GeoLocation,
  PlanEvent,
  Risk,
  Venue,
  VenueFormData,
} from "@/data/types";
import { createSeedState } from "@/data/seed";
import { parsePersistedState } from "./persisted-state";
import {
  approveProposal,
  cancelEvent,
  createEvent,
  createVenue,
  deleteEvent,
  deleteVenue,
  nowLocal,
  rejectProposal,
  setEventLocation,
  setEventWeatherRisk,
  updateEvent,
  updateVenue,
} from "@/lib/planning";

/**
 * In-browser persistence layer. Swap this module for an API client to attach a backend;
 * components only use useDemoState() and the action functions below.
 */
const STORAGE_KEY = "planzo-demo-state-v1";
const SERVER_SNAPSHOT = createSeedState();
let state: DemoState | null = null;
const listeners = new Set<() => void>();

function load(): DemoState {
  if (state) return state;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    state = (raw ? parsePersistedState(JSON.parse(raw)) : null) ?? createSeedState();
  } catch {
    state = createSeedState();
  }
  return state;
}

function commit(next: DemoState) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDemoState(): DemoState {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window === "undefined" ? SERVER_SNAPSHOT : load()),
    () => SERVER_SNAPSHOT,
  );
}

export function getDemoStateSnapshot(): DemoState {
  return load();
}

export function createEventAction(input: EventFormData): PlanEvent {
  const current = load();
  const { state: next, event } = createEvent(current, input, nowLocal());
  commit(next);
  return event;
}

export function updateEventAction(eventId: string, input: EventFormData): PlanEvent {
  const current = load();
  const { state: next, event } = updateEvent(current, eventId, input, nowLocal());
  commit(next);
  return event;
}

export function cancelEventAction(eventId: string) {
  const current = load();
  const next = cancelEvent(current, eventId, nowLocal());
  commit(next);
}

export function deleteEventAction(eventId: string) {
  const current = load();
  const next = deleteEvent(current, eventId);
  commit(next);
}

export function createVenueAction(input: VenueFormData): Venue {
  const current = load();
  const { state: next, venue } = createVenue(current, input, nowLocal());
  commit(next);
  return venue;
}

export function updateVenueAction(venueId: string, input: VenueFormData): Venue {
  const current = load();
  const { state: next, venue } = updateVenue(current, venueId, input, nowLocal());
  commit(next);
  return venue;
}

export function deleteVenueAction(venueId: string): void {
  const current = load();
  const next = deleteVenue(current, venueId, nowLocal());
  commit(next);
}

export function setEventWeatherRiskAction(
  eventId: string,
  risk: Risk | null,
  weatherMode?: "simulated" | "forecast",
): void {
  const current = load();
  const next = setEventWeatherRisk(current, eventId, risk, weatherMode, nowLocal());
  commit(next);
}

export function setEventLocationAction(eventId: string, location: GeoLocation | undefined): void {
  const current = load();
  const next = setEventLocation(current, eventId, location);
  commit(next);
}

export function approve(proposalId: string) {
  commit(approveProposal(load(), proposalId, nowLocal()));
}

export function reject(proposalId: string) {
  commit(rejectProposal(load(), proposalId, nowLocal()));
}

let resetCounter = 0;

export function resetDemo() {
  resetCounter += 1;
  const next = createSeedState();
  next.resetKey = Date.now() + resetCounter;
  commit(next);
}
