import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DecisionStudio } from "@/components/DecisionStudio";
import { createSeedState } from "@/data/seed";
import { approveProposal, buildProposal } from "@/lib/planning";
import * as demoStore from "@/services/demo-store";

describe("<DecisionStudio />", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders suggested requests and initial guidance", () => {
    const state = createSeedState();
    const event = state.events[0]!;

    render(<DecisionStudio state={state} event={event} />);

    expect(screen.getByText("Decision Studio")).toBeDefined();
    expect(screen.getByText("Check risk")).toBeDefined();
    expect(screen.getByText("Find an alternative")).toBeDefined();
    expect(screen.getByText("Show plan")).toBeDefined();
  });

  it("displays proposal card deterministically on find_alternative intent even when backend is offline", async () => {
    const state = createSeedState();
    const event = state.events[0]!;

    // Mock fetch to simulate offline backend failure
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network Error"));

    render(<DecisionStudio state={state} event={event} />);

    const altButton = screen.getByRole("button", { name: "Find an alternative" });
    fireEvent.click(altButton);

    // Wait for the user message and offline fallback message to appear
    await waitFor(() => {
      expect(screen.getAllByText("Find an alternative").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Offline fallback")).toBeDefined();
    });

    // Verify the deterministic proposal card is displayed
    expect(screen.getByText("Proposed change")).toBeDefined();
    expect(screen.getByText("Why Seminar Hall A")).toBeDefined();
    expect(screen.getByRole("button", { name: /Approve moving/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Reject moving/i })).toBeDefined();
  });

  it("streams Gemini assistant response when backend is available", async () => {
    const state = createSeedState();
    const event = state.events[0]!;

    const streamResponse =
      'event: token\ndata: {"text": "Seminar Hall A is ready."}\n\n' +
      'event: done\ndata: {"status": "complete"}\n\n';

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(streamResponse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    render(<DecisionStudio state={state} event={event} />);

    const input = screen.getByPlaceholderText(/find an alternative/i);
    const sendBtn = screen.getByRole("button", { name: "Send request" });

    fireEvent.change(input, { target: { value: "Tell me about Seminar Hall A" } });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText(/Seminar Hall A is ready\./)).toBeDefined();
      expect(screen.getByText(/Planzo · Gemini Assistant/)).toBeDefined();
    });
  });

  it("allows approving the proposal and calls store approval", async () => {
    const state = createSeedState();
    const event = state.events[0]!;
    const approveSpy = vi.spyOn(demoStore, "approve");

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

    render(<DecisionStudio state={state} event={event} />);

    const altButton = screen.getByRole("button", { name: "Find an alternative" });
    fireEvent.click(altButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Approve moving/i })).toBeDefined();
    });

    const approveBtn = screen.getByRole("button", { name: /Approve moving/i });
    fireEvent.click(approveBtn);

    expect(approveSpy).toHaveBeenCalledWith("techfest:courtyard->hall-a");
  });

  describe("Alexa+ Simulation Mode (M3)", () => {
    it("enters and exits Alexa+ simulation mode via segmented switch", () => {
      const state = createSeedState();
      const event = state.events[0]!;

      render(<DecisionStudio state={state} event={event} />);

      // Initially in Standard mode
      expect(screen.getByText("Decision Studio")).toBeDefined();
      expect(screen.queryByText(/Simulated Alexa\+-style interaction/)).toBeNull();

      // Switch to Alexa+ Simulation
      const alexaTab = screen.getByRole("tab", { name: /Alexa\+ Simulation/i });
      fireEvent.click(alexaTab);

      // Verify title, badge, disclosure banner and voice suggestions
      expect(screen.getByText("Alexa+ Experience Simulation")).toBeDefined();
      expect(screen.getByText("Voice Experience Simulation")).toBeDefined();
      expect(
        screen.getByText(/Simulated Alexa\+-style interaction powered by Gemini/i),
      ).toBeDefined();
      expect(
        screen.getByText(`Alexa, ask Planzo what's happening with ${event.name}`),
      ).toBeDefined();
      expect(screen.getByText("Alexa, ask Planzo to find a safer venue")).toBeDefined();

      // Switch back to Standard mode
      const standardTab = screen.getByRole("tab", { name: "Standard" });
      fireEvent.click(standardTab);

      expect(screen.getByText("Decision Studio")).toBeDefined();
      expect(screen.queryByText(/Simulated Alexa\+-style interaction/)).toBeNull();
      expect(screen.getByText("Check risk")).toBeDefined();
    });

    it("triggers deterministic proposal card for voice-style venue request", async () => {
      const state = createSeedState();
      const event = state.events[0]!;

      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

      render(<DecisionStudio state={state} event={event} mode="alexa" />);

      const voiceSuggestion = screen.getByRole("button", {
        name: "Alexa, ask Planzo to find a safer venue",
      });
      fireEvent.click(voiceSuggestion);

      await waitFor(() => {
        expect(screen.getByText(/Planzo · Alexa\+ Offline Reply/)).toBeDefined();
      });

      // Verify proposal card is rendered deterministically
      expect(screen.getByText("Proposed change")).toBeDefined();
      expect(screen.getByText("Why Seminar Hall A")).toBeDefined();
      expect(screen.getByRole("button", { name: /Approve moving/i })).toBeDefined();
    });

    it("never auto-approves from conversational approval requests (action safety)", async () => {
      const state = createSeedState();
      const event = state.events[0]!;
      const approveSpy = vi.spyOn(demoStore, "approve");

      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

      render(<DecisionStudio state={state} event={event} mode="alexa" />);

      const input = screen.getByPlaceholderText(/Alexa, ask Planzo/i);
      const sendBtn = screen.getByRole("button", { name: "Send request" });

      fireEvent.change(input, { target: { value: "Alexa, approve this change now" } });
      fireEvent.click(sendBtn);

      await waitFor(() => {
        expect(screen.getByText(/cannot be executed conversationally/i)).toBeDefined();
      });

      // Crucial: Conversation must NEVER execute the approval
      expect(approveSpy).not.toHaveBeenCalled();
    });

    it("supports optional speech synthesis reading aloud when supported", async () => {
      const state = createSeedState();
      const event = state.events[0]!;

      const speakMock = vi.fn();
      const cancelMock = vi.fn();

      // Mock window.speechSynthesis
      Object.defineProperty(window, "speechSynthesis", {
        writable: true,
        configurable: true,
        value: {
          speak: speakMock,
          cancel: cancelMock,
          pause: vi.fn(),
          resume: vi.fn(),
        },
      });

      class MockUtterance {
        text: string;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      }

      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        writable: true,
        configurable: true,
        value: MockUtterance,
      });
      Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
        writable: true,
        configurable: true,
        value: MockUtterance,
      });

      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Offline"));

      render(<DecisionStudio state={state} event={event} mode="alexa" />);

      const voiceSuggestion = screen.getByRole("button", {
        name: `Alexa, ask Planzo what's happening with ${event.name}`,
      });
      fireEvent.click(voiceSuggestion);

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: "Read response aloud using browser speech synthesis",
          }),
        ).toBeDefined();
      });

      const readAloudBtn = screen.getByRole("button", {
        name: "Read response aloud using browser speech synthesis",
      });
      fireEvent.click(readAloudBtn);

      expect(speakMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("Post-Approval Recovery & Announcement Draft (M4)", () => {
    it("renders Recovery completed section and announcement draft after approval", () => {
      const state = createSeedState();
      const proposal = buildProposal(state, "techfest")!;
      const approvedState = approveProposal(state, proposal.id, "2026-10-23T10:05:00");
      const event = approvedState.events.find((e) => e.id === "techfest")!;

      render(<DecisionStudio state={approvedState} event={event} />);

      // Verify Recovery completed heading and status
      expect(screen.getByText("Recovery completed")).toBeDefined();
      expect(screen.getByText("Handled & verified")).toBeDefined();
      expect(screen.getByText(/has been successfully relocated to/i)).toBeDefined();

      // Verify previous and current venue metadata
      expect(screen.getByText("Outdoor Courtyard")).toBeDefined();
      expect(screen.getAllByText(/Seminar Hall A/).length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("Assignment updated")).toBeDefined();

      // Verify Attendee Announcement Draft card and "Draft — not sent" status
      expect(screen.getByText("Attendee announcement draft")).toBeDefined();
      expect(screen.getByText("Draft — not sent")).toBeDefined();
      expect(screen.getByText("Subject: Important Venue Update — TechFest Workshop")).toBeDefined();
      expect(screen.getByText(/Due to a simulated heavy-rain contingency/i)).toBeDefined();
    });

    it("allows copying the announcement draft to clipboard with visual confirmation", async () => {
      const state = createSeedState();
      const proposal = buildProposal(state, "techfest")!;
      const approvedState = approveProposal(state, proposal.id, "2026-10-23T10:05:00");
      const event = approvedState.events.find((e) => e.id === "techfest")!;

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        writable: true,
        configurable: true,
        value: {
          writeText: writeTextMock,
        },
      });

      render(<DecisionStudio state={approvedState} event={event} />);

      const copyBtn = screen.getByRole("button", {
        name: "Copy attendee announcement draft to clipboard",
      });
      expect(copyBtn).toBeDefined();
      fireEvent.click(copyBtn);

      await waitFor(() => {
        expect(screen.getByText("Copied!")).toBeDefined();
      });

      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Subject: Important Venue Update — TechFest Workshop"),
      );
      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining("Due to a simulated heavy-rain contingency"),
      );
    });

    it("does not render Recovery completed when a proposal is rejected", () => {
      const state = createSeedState();
      const event = state.events[0]!;

      render(<DecisionStudio state={state} event={event} />);

      expect(screen.queryByText("Recovery completed")).toBeNull();
      expect(screen.queryByText("Attendee announcement draft")).toBeNull();
      expect(screen.queryByText("Draft — not sent")).toBeNull();
    });

    it("works consistently in Alexa+ Simulation mode", () => {
      const state = createSeedState();
      const proposal = buildProposal(state, "techfest")!;
      const approvedState = approveProposal(state, proposal.id, "2026-10-23T10:05:00");
      const event = approvedState.events.find((e) => e.id === "techfest")!;

      render(<DecisionStudio state={approvedState} event={event} mode="alexa" />);

      // Verify Alexa+ mode header & disclaimer are active
      expect(screen.getByText("Alexa+ Experience Simulation")).toBeDefined();
      expect(
        screen.getByText(/Simulated Alexa\+-style interaction powered by Gemini/i),
      ).toBeDefined();

      // Verify Recovery completed & announcement draft are rendered seamlessly
      expect(screen.getByText("Recovery completed")).toBeDefined();
      expect(screen.getByText("Attendee announcement draft")).toBeDefined();
      expect(screen.getByText("Draft — not sent")).toBeDefined();
    });
  });

  describe("Dynamic Event Context & Absence of Stale Hardcoding (M5)", () => {
    it("renders dynamic context for non-TechFest events without hardcoded TechFest strings", () => {
      const state = createSeedState();
      // Second event in seed data is 'design-review' (Product Design Review)
      const event = state.events.find((e) => e.id === "design-review")!;

      render(<DecisionStudio state={state} event={event} mode="alexa" />);

      // Voice prompt chip should reference Product Design Review, NOT TechFest Workshop
      expect(
        screen.getByText("Alexa, ask Planzo what's happening with Product Design Review"),
      ).toBeDefined();
      expect(screen.queryByText(/TechFest/i)).toBeNull();
      expect(screen.queryByText(/Seminar Hall B won't work/i)).toBeNull();
    });

    it("dynamically adapts Alexa suggestion when an alternative venue is excluded", () => {
      const state = createSeedState();
      // In seed state, TechFest excludes Seminar Hall B because of conflict and capacity
      const event = state.events.find((e) => e.id === "techfest")!;

      render(<DecisionStudio state={state} event={event} mode="alexa" />);

      // First excluded venue for TechFest is Seminar Hall B
      expect(screen.getByText("Alexa, ask Planzo why Seminar Hall B won't work")).toBeDefined();
    });
  });
});
