import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DecisionStudio } from "@/components/DecisionStudio";
import { createSeedState } from "@/data/seed";
import { approveProposal, buildProposal, cancelEvent } from "@/lib/planning";
import { sendChatMessage } from "@/services/chat-api";

afterEach(() => vi.restoreAllMocks());
describe("assistant authorization and stream completion", () => {
  it("handles approval guidance locally even if the model would claim approval", async () => {
    const state = createSeedState();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          'event: token\ndata: {"text":"Approved! I moved the event."}\n\nevent: done\ndata: {}\n\n',
        ),
      );
    render(<DecisionStudio state={state} event={state.events[0]!} />);
    fireEvent.change(screen.getByPlaceholderText(/find an alternative/i), {
      target: { value: "Alexa, approve this change" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() =>
      expect(screen.getByText(/cannot be executed conversationally/)).toBeDefined(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/Approved! I moved/)).toBeNull();
  });

  it("does not show a cancelled event as recovered with an active booking", () => {
    const state = createSeedState();
    const approved = approveProposal(
      state,
      buildProposal(state, "techfest")!.id,
      "2026-10-23T09:00:00",
    );
    const cancelled = cancelEvent(approved, "techfest", "2026-10-23T09:01:00");
    render(<DecisionStudio state={cancelled} event={cancelled.events[0]!} />);
    expect(screen.queryByText("Recovery completed")).toBeNull();
  });

  it("finishes on the SSE done event even when the connection stays open", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: done\ndata: {}\n\n"));
      },
      cancel,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(stream));
    const state = createSeedState();
    const done = vi.fn();
    await sendChatMessage({
      state,
      event: state.events[0]!,
      userMessage: "Show plan",
      onToken: vi.fn(),
      onDone: done,
    });
    expect(done).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });
});
