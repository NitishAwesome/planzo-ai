import type { DemoState, PlanEvent } from "@/data/types";
import { buildProposal, evaluateVenues, getVenue } from "@/lib/planning";

export const DEFAULT_API_BASE_URL =
  typeof window !== "undefined" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
    ? "https://planzo-ai.onrender.com"
    : "http://127.0.0.1:8000";

export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env["VITE_API_BASE_URL"]) ||
  DEFAULT_API_BASE_URL;

export class ChatApiError extends Error {
  statusCode?: number | undefined;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "ChatApiError";
    this.statusCode = statusCode;
  }
}

export interface SseMessage {
  event: string;
  data: string;
}

/**
 * Parses a single complete SSE event block (text delimited by \n\n or \r\n\r\n).
 */
export function parseSseBlock(block: string): SseMessage | null {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      // Empty line or SSE comment
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0 && event === "message") {
    return null;
  }

  return {
    event,
    data: dataLines.join("\n"),
  };
}

/**
 * Constructs the structured, grounded event context for the backend.
 * Captures live state including current venue, simulated risk, candidate venues,
 * and deterministic best proposal.
 */
export function buildEventContext(state: DemoState, event: PlanEvent) {
  const currentVenue = getVenue(state, event.venueId) ?? null;
  const candidates = evaluateVenues(state, event);
  const bestProposal = buildProposal(state, event.id);

  return {
    event,
    currentVenue,
    risk: event.risk,
    candidates,
    bestProposal,
  };
}

export interface SendChatMessageOptions {
  state: DemoState;
  event: PlanEvent;
  userMessage: string;
  signal?: AbortSignal;
  onToken: (token: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Sends a chat message to the FastAPI backend and streams tokens via Server-Sent Events.
 * Handles split network chunks, UTF-8 boundaries, and backend error events.
 */
export async function sendChatMessage({
  state,
  event,
  userMessage,
  signal,
  onToken,
  onDone,
  onError,
}: SendChatMessageOptions): Promise<void> {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    throw new ChatApiError("Message cannot be empty");
  }

  const eventContext = buildEventContext(state, event);
  const payload = {
    eventContext,
    userMessage: trimmed,
  };

  const url = `${API_BASE_URL.replace(/\/+$/, "")}/api/chat`;

  if (signal?.aborted) {
    return;
  }

  let isTerminated = false;
  let doneReceived = false;

  const triggerDone = () => {
    if (isTerminated || signal?.aborted) return;
    isTerminated = true;
    onDone?.();
  };

  const triggerError = (err: Error) => {
    if (isTerminated || signal?.aborted) return;
    isTerminated = true;
    onError?.(err);
  };

  let response: Response;
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
  };
  if (signal) {
    init.signal = signal;
  }

  try {
    response = await fetch(url, init);
  } catch (err) {
    if (signal?.aborted) {
      return;
    }
    const message = err instanceof Error ? err.message : "Failed to connect to assistant service";
    const error = new ChatApiError(`Backend connection failed: ${message}`);
    triggerError(error);
    throw error;
  }

  if (!response.ok) {
    let detail = `Server responded with ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson && typeof errJson.detail === "string") {
        detail = errJson.detail;
      }
    } catch {
      // keep fallback detail
    }
    const error = new ChatApiError(detail, response.status);
    triggerError(error);
    throw error;
  }

  if (!response.body) {
    const error = new ChatApiError("Response body is not readable");
    triggerError(error);
    throw error;
  }

  const reader = response.body.getReader();
  const cancelReader = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancelReader, { once: true });
  if (signal?.aborted) cancelReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const processBlock = (block: string) => {
    if (!block.trim()) return;
    const msg = parseSseBlock(block);
    if (!msg || isTerminated || signal?.aborted) return;

    if (msg.event === "token") {
      try {
        const parsed = JSON.parse(msg.data) as { text?: string };
        if (typeof parsed.text === "string") {
          onToken(parsed.text);
        }
      } catch {
        // If data is raw text
        if (msg.data) onToken(msg.data);
      }
    } else if (msg.event === "done") {
      doneReceived = true;
      triggerDone();
    } else if (msg.event === "error") {
      let errText = "An error occurred during response generation";
      try {
        const parsed = JSON.parse(msg.data) as { error?: string };
        if (parsed.error) errText = parsed.error;
      } catch {
        if (msg.data) errText = msg.data;
      }
      const error = new ChatApiError(errText);
      triggerError(error);
      throw error;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // SSE blocks are delimited by two consecutive newlines (\n\n or \r\n\r\n)
      const blocks = buffer.split(/(?:\r?\n){2}/);
      // The last element is either empty (if ended on boundary) or an incomplete block
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        processBlock(block);
      }
      if (isTerminated || signal?.aborted) break;
    }

    // Flush any remaining buffered block if complete
    buffer += decoder.decode();
    if (buffer.trim()) {
      processBlock(buffer);
    }

    if (!doneReceived && !isTerminated) {
      const eofError = new ChatApiError("Stream closed unexpectedly before completion");
      triggerError(eofError);
      throw eofError;
    }

    triggerDone();
  } catch (err) {
    if (signal?.aborted) {
      return;
    }
    const error = err instanceof ChatApiError ? err : new ChatApiError(String(err));
    triggerError(error);
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancelReader);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
