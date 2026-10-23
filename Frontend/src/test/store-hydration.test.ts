import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSeedState } from "@/data/seed";

const KEY = "planzo-demo-state-v1";
describe("persisted state validation", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it.each([
    { version: 1 },
    { ...createSeedState(), events: null },
    { ...createSeedState(), events: [{ id: "broken" }] },
    { ...createSeedState(), venues: [] },
    { ...createSeedState(), bookings: [] },
  ])("recovers safely from malformed or inconsistent saved state %#", async (invalid) => {
    localStorage.setItem(KEY, JSON.stringify(invalid));
    const { getDemoStateSnapshot } = await import("@/services/demo-store");
    const loaded = getDemoStateSnapshot();
    expect(loaded).toEqual(createSeedState());
  });

  it("retains valid existing user data", async () => {
    const seed = createSeedState();
    seed.events[0]!.name = "My saved workshop";
    localStorage.setItem(KEY, JSON.stringify(seed));
    const { getDemoStateSnapshot } = await import("@/services/demo-store");
    expect(getDemoStateSnapshot().events[0]!.name).toBe("My saved workshop");
  });
});
