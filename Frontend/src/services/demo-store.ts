import { useSyncExternalStore } from "react";
import type { DemoState } from "@/data/types";
import { createSeedState } from "@/data/seed";
import { approveProposal, nowLocal, rejectProposal } from "@/lib/planning";

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
    const parsed = raw ? (JSON.parse(raw) as DemoState) : null;
    state = parsed && parsed.version === 1 ? parsed : createSeedState();
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

export function approve(proposalId: string) {
  commit(approveProposal(load(), proposalId, nowLocal()));
}

export function reject(proposalId: string) {
  commit(rejectProposal(load(), proposalId, nowLocal()));
}

export function resetDemo() {
  commit(createSeedState());
}
