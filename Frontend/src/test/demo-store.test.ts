import { beforeEach, describe, expect, it } from "vitest";
import { approve, reject, resetDemo } from "@/services/demo-store";
import { buildProposal } from "@/lib/planning";
import { createSeedState } from "@/data/seed";

const STORAGE_KEY = "planzo-demo-state-v1";

describe("demo-store service", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetDemo();
  });

  it("resets demo and writes seed state to localStorage", () => {
    resetDemo();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    expect(stored.version).toBe(1);
    expect(stored.events).toHaveLength(3);
    expect(stored.decisions).toHaveLength(1);
    expect(stored.decisions[0].id).toBe("d-seed-1");
  });

  it("approves a proposal and updates localStorage", () => {
    const seed = createSeedState();
    const proposal = buildProposal(seed, "techfest");
    expect(proposal).not.toBeNull();

    approve(proposal!.id);

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    const techfest = stored.events.find((e: { id: string }) => e.id === "techfest");
    expect(techfest.venueId).toBe("hall-a");
    expect(techfest.risk.status).toBe("handled");
    expect(stored.decisions).toHaveLength(2);
    expect(stored.decisions.at(-1)?.outcome).toBe("approved");
  });

  it("rejects a proposal and records rejected decision without changing venue", () => {
    const seed = createSeedState();
    const proposal = buildProposal(seed, "techfest");
    expect(proposal).not.toBeNull();

    reject(proposal!.id);

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    const techfest = stored.events.find((e: { id: string }) => e.id === "techfest");
    expect(techfest.venueId).toBe("courtyard");
    expect(stored.decisions).toHaveLength(2);
    expect(stored.decisions.at(-1)?.outcome).toBe("rejected");
  });

  it("resetDemo restores clean state after an approval", () => {
    const seed = createSeedState();
    const proposal = buildProposal(seed, "techfest");
    approve(proposal!.id);

    resetDemo();

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    const techfest = stored.events.find((e: { id: string }) => e.id === "techfest");
    expect(techfest.venueId).toBe("courtyard");
    expect(techfest.risk.status).toBe("active");
    expect(stored.decisions).toHaveLength(1);
    expect(stored.decisions[0].id).toBe("d-seed-1");
  });
});
