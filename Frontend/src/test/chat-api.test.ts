import { describe, expect, it, vi } from "vitest";
import { createSeedState } from "@/data/seed";
import { approveProposal, buildProposal } from "@/lib/planning";
import {
  buildEventContext,
  parseSseBlock,
  sendChatMessage,
  ChatApiError,
} from "@/services/chat-api";

describe("chat-api service", () => {
  describe("buildEventContext", () => {
    it("constructs accurate context for TechFest before approval", () => {
      const state = createSeedState();
      const event = state.events.find((e) => e.id === "techfest")!;
      const ctx = buildEventContext(state, event);

      expect(ctx.event.id).toBe("techfest");
      expect(ctx.currentVenue?.id).toBe("courtyard");
      expect(ctx.currentVenue?.name).toBe("Outdoor Courtyard");
      expect(ctx.risk?.kind).toBe("heavy-rain");
      expect(ctx.risk?.source).toBe("Simulated scenario");
      expect(ctx.risk?.status).toBe("active");

      // Verify candidates
      expect(ctx.candidates.length).toBeGreaterThan(0);
      const hallA = ctx.candidates.find((c) => c.venue.id === "hall-a")!;
      expect(hallA.eligible).toBe(true);
      expect(hallA.reasons).toContain("Fits 50 of 80 seats");

      const hallB = ctx.candidates.find((c) => c.venue.id === "hall-b")!;
      expect(hallB.eligible).toBe(false);
      expect(hallB.reasons).toContain("Too small: 30 seats for 50 attendees");

      // Verify deterministic proposal
      expect(ctx.bestProposal?.toVenueId).toBe("hall-a");
    });

    it("constructs accurate context for TechFest after approval", () => {
      const state = createSeedState();
      const proposal = buildProposal(state, "techfest")!;
      const approvedState = approveProposal(state, proposal.id, "2026-10-22T12:00:00");
      const event = approvedState.events.find((e) => e.id === "techfest")!;

      const ctx = buildEventContext(approvedState, event);
      expect(ctx.currentVenue?.id).toBe("hall-a");
      expect(ctx.currentVenue?.name).toBe("Seminar Hall A");
      expect(ctx.risk?.status).toBe("handled");
      // Once handled, no active proposal is needed
      expect(ctx.bestProposal).toBeNull();
    });
  });

  describe("parseSseBlock", () => {
    it("parses token events with LF and CRLF line endings", () => {
      const lf = 'event: token\ndata: {"text": "Hello"}';
      expect(parseSseBlock(lf)).toEqual({
        event: "token",
        data: '{"text": "Hello"}',
      });

      const crlf = 'event: token\r\ndata: {"text": "World"}';
      expect(parseSseBlock(crlf)).toEqual({
        event: "token",
        data: '{"text": "World"}',
      });
    });

    it("parses done and error events", () => {
      expect(parseSseBlock('event: done\ndata: {"status": "complete"}')).toEqual({
        event: "done",
        data: '{"status": "complete"}',
      });

      expect(parseSseBlock('event: error\ndata: {"error": "Rate limit"}')).toEqual({
        event: "error",
        data: '{"error": "Rate limit"}',
      });
    });
  });

  describe("sendChatMessage stream handling", () => {
    it("handles valid SSE streams delivering tokens and done signal", async () => {
      const state = createSeedState();
      const event = state.events[0]!;
      const tokens: string[] = [];
      let doneCalled = false;

      const streamText =
        'event: token\ndata: {"text": "Seminar "}\n\n' +
        'event: token\ndata: {"text": "Hall A"}\n\n' +
        'event: done\ndata: {"status": "complete"}\n\n';

      const mockResponse = new Response(streamText, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

      await sendChatMessage({
        state,
        event,
        userMessage: "Find alternative",
        onToken: (t) => tokens.push(t),
        onDone: () => {
          doneCalled = true;
        },
      });

      expect(tokens).toEqual(["Seminar ", "Hall A"]);
      expect(doneCalled).toBe(true);

      vi.restoreAllMocks();
    });

    it("correctly reassembles network chunks split across boundaries", async () => {
      const state = createSeedState();
      const event = state.events[0]!;
      const tokens: string[] = [];
      let doneCalled = false;

      // Simulate 3 network chunks that slice SSE frames across byte boundaries
      const chunk1 = "event: tok";
      const chunk2 = 'en\ndata: {"text": "Reassembled"}\n\nevent: do';
      const chunk3 = 'ne\ndata: {"status": "complete"}\n\n';

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(chunk1));
          controller.enqueue(encoder.encode(chunk2));
          controller.enqueue(encoder.encode(chunk3));
          controller.close();
        },
      });

      const mockResponse = new Response(readable, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

      await sendChatMessage({
        state,
        event,
        userMessage: "Find alternative",
        onToken: (t) => tokens.push(t),
        onDone: () => {
          doneCalled = true;
        },
      });

      expect(tokens).toEqual(["Reassembled"]);
      expect(doneCalled).toBe(true);

      vi.restoreAllMocks();
    });

    it("handles backend unavailable network errors", async () => {
      const state = createSeedState();
      const event = state.events[0]!;
      let errorReported: Error | null = null;

      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(
        sendChatMessage({
          state,
          event,
          userMessage: "Find alternative",
          onToken: vi.fn(),
          onError: (e) => {
            errorReported = e;
          },
        }),
      ).rejects.toThrow("Backend connection failed: Failed to fetch");

      expect(errorReported).toBeInstanceOf(ChatApiError);

      vi.restoreAllMocks();
    });

    it("handles mid-stream error events emitted from backend", async () => {
      const state = createSeedState();
      const event = state.events[0]!;
      const tokens: string[] = [];
      let errorReported: Error | null = null;

      const streamWithError =
        'event: token\ndata: {"text": "Partial analysis... "}\n\n' +
        'event: error\ndata: {"error": "Upstream rate limit exceeded"}\n\n';

      const mockResponse = new Response(streamWithError, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

      await expect(
        sendChatMessage({
          state,
          event,
          userMessage: "Find alternative",
          onToken: (t) => tokens.push(t),
          onError: (e) => {
            errorReported = e;
          },
        }),
      ).rejects.toThrow("Upstream rate limit exceeded");

      expect(tokens).toEqual(["Partial analysis... "]);
      expect((errorReported as Error | null)?.message).toBe("Upstream rate limit exceeded");

      vi.restoreAllMocks();
    });

    it("handles duplicate done events in SSE stream without invoking onDone multiple times", async () => {
      const state = createSeedState();
      const event = state.events[0]!;
      let doneCount = 0;

      const streamWithDuplicateDone =
        'event: token\ndata: {"text": "All done"}\n\n' +
        'event: done\ndata: {"status": "complete"}\n\n' +
        'event: done\ndata: {"status": "complete"}\n\n';

      const mockResponse = new Response(streamWithDuplicateDone, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

      await sendChatMessage({
        state,
        event,
        userMessage: "Find alternative",
        onToken: vi.fn(),
        onDone: () => {
          doneCount++;
        },
      });

      expect(doneCount).toBe(1);

      vi.restoreAllMocks();
    });

    it("handles stream error event followed by stream close without firing onDone or duplicate error", async () => {
      const state = createSeedState();
      const event = state.events[0]!;
      let doneCount = 0;
      let errorCount = 0;

      const streamWithErrorAndClose =
        'event: token\ndata: {"text": "Starting analysis..."}\n\n' +
        'event: error\ndata: {"error": "Upstream service timeout"}\n\n';

      const mockResponse = new Response(streamWithErrorAndClose, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

      await expect(
        sendChatMessage({
          state,
          event,
          userMessage: "Find alternative",
          onToken: vi.fn(),
          onDone: () => {
            doneCount++;
          },
          onError: () => {
            errorCount++;
          },
        }),
      ).rejects.toThrow("Upstream service timeout");

      expect(errorCount).toBe(1);
      expect(doneCount).toBe(0);

      vi.restoreAllMocks();
    });

    it("treats unexpected stream closure before done event as an error and never calls onDone", async () => {
      const state = createSeedState();
      const event = state.events[0]!;
      let doneCalled = false;
      let errorReported: Error | null = null;

      // Stream closes abruptly after a token without any done or error event
      const abruptStream = 'event: token\ndata: {"text": "Midway stream truncation..."}\n\n';

      const mockResponse = new Response(abruptStream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(mockResponse);

      await expect(
        sendChatMessage({
          state,
          event,
          userMessage: "Find alternative",
          onToken: vi.fn(),
          onDone: () => {
            doneCalled = true;
          },
          onError: (e) => {
            errorReported = e;
          },
        }),
      ).rejects.toThrow(/Stream closed unexpectedly before completion/i);

      expect(doneCalled).toBe(false);
      expect(errorReported).toBeInstanceOf(ChatApiError);

      vi.restoreAllMocks();
    });

    it("handles explicit request abort without invoking onDone or unhandled errors", async () => {
      const state = createSeedState();
      const event = state.events[0]!;
      const controller = new AbortController();
      let doneCalled = false;

      // Create a stream that emits one chunk, then aborts
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode('event: token\ndata: {"text": "Cancelled..."}\n\n'));
          // Controller will abort before done
        },
      });

      const mockResponse = new Response(readable, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

      vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (_url, init) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => {
          // fetch throws DOMException when aborted
        });
        // Abort right away
        controller.abort();
        const err = new DOMException("The user aborted a request.", "AbortError");
        throw err;
      });

      const onErrorSpy = vi.fn();
      await sendChatMessage({
        state,
        event,
        userMessage: "Find alternative",
        signal: controller.signal,
        onToken: vi.fn(),
        onDone: () => {
          doneCalled = true;
        },
        onError: onErrorSpy,
      });

      expect(doneCalled).toBe(false);
      expect(onErrorSpy).not.toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });
});
