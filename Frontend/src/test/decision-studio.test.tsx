import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DecisionStudio } from "@/components/DecisionStudio";
import { createSeedState } from "@/data/seed";
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
});
