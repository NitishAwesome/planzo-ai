import type { DemoState, PlanEvent } from "@/data/types";
import { buildProposal, evaluateVenues, getVenue } from "@/lib/planning";

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

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
    onError?.(error);
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
    onError?.(error);
    throw error;
  }

  if (!response.body) {
    const error = new ChatApiError("Response body is not readable");
    onError?.(error);
    throw error;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

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
        if (!block.trim()) continue;
        const msg = parseSseBlock(block);
        if (!msg) continue;

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
          onDone?.();
        } else if (msg.event === "error") {
          let errText = "An error occurred during response generation";
          try {
            const parsed = JSON.parse(msg.data) as { error?: string };
            if (parsed.error) errText = parsed.error;
          } catch {
            if (msg.data) errText = msg.data;
          }
          const error = new ChatApiError(errText);
          onError?.(error);
          throw error;
        }
      }
    }

    // Flush any remaining buffered block if complete
    buffer += decoder.decode();
    if (buffer.trim()) {
      const msg = parseSseBlock(buffer);
      if (msg) {
        if (msg.event === "token") {
          try {
            const parsed = JSON.parse(msg.data) as { text?: string };
            if (typeof parsed.text === "string") onToken(parsed.text);
          } catch {
            if (msg.data) onToken(msg.data);
          }
        } else if (msg.event === "done") {
          onDone?.();
        } else if (msg.event === "error") {
          const error = new ChatApiError(msg.data || "Error during stream");
          onError?.(error);
          throw error;
        }
      }
    }

    onDone?.();
  } catch (err) {
    if (signal?.aborted) {
      return;
    }
    const error = err instanceof ChatApiError ? err : new ChatApiError(String(err));
    onError?.(error);
    throw error;
  }
}
