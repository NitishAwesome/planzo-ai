import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  Info,
  Radio,
  Send,
  Volume2,
  VolumeX,
  X,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { DemoState, PlanEvent } from "@/data/types";
import { EQUIPMENT_LABEL } from "@/data/types";
import {
  buildProposal,
  evaluateVenues,
  fmtTime,
  getEventRecoveryDecision,
  getVenue,
  parseIntent,
  PlanningError,
  replyFor,
  type Intent,
} from "@/lib/planning";
import { approve, reject } from "@/services/demo-store";
import { sendChatMessage } from "@/services/chat-api";
import { cn } from "@/lib/utils";
import { Pill } from "./bits";
import { RecoveryCompleted } from "./RecoveryCompleted";

export type StudioMode = "standard" | "alexa";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  intent?: Intent;
  showProposal?: boolean;
  isStreaming?: boolean;
  source?: "gemini" | "fallback" | "computed";
  errorNotice?: string | null;
}

const STANDARD_SUGGESTIONS = ["Check risk", "Find an alternative", "Show plan"];

export function DecisionStudio({
  state,
  event,
  mode: controlledMode,
  onModeChange,
}: {
  state: DemoState;
  event: PlanEvent;
  mode?: StudioMode;
  onModeChange?: (mode: StudioMode) => void;
}) {
  const [internalMode, setInternalMode] = useState<StudioMode>("standard");
  const mode = controlledMode ?? internalMode;

  function setMode(newMode: StudioMode) {
    if (onModeChange) {
      onModeChange(newMode);
    } else {
      setInternalMode(newMode);
    }
  }

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<null | "approved" | "rejected">(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const logRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const hasSpeechSynthesis = typeof window !== "undefined" && "speechSynthesis" in window;

  const proposal = buildProposal(state, event.id);
  const evaluations = proposal ? proposal.evaluations : evaluateVenues(state, event);
  const excludedVenue = evaluations.find((e) => !e.eligible)?.venue;
  const excludedVenueName = excludedVenue ? excludedVenue.name : "another venue";

  const hasActiveRisk = event.risk?.status === "active";
  const isHandled = event.risk?.status === "handled";
  const currentVenue = getVenue(state, event.venueId);

  const standardSuggestions = isHandled
    ? ["Check risk", "Show plan"]
    : hasActiveRisk
      ? ["Check risk", "Find an alternative", "Show plan"]
      : ["Check status", "Check venue capacity", "Show schedule"];

  const alexaSuggestions = isHandled
    ? [
        `Alexa, ask Planzo what's happening with ${event.name}`,
        "Alexa, ask Planzo to show the recovery plan",
        "Alexa, ask Planzo how many attendees are affected",
      ]
    : hasActiveRisk
      ? [
          `Alexa, ask Planzo what's happening with ${event.name}`,
          "Alexa, ask Planzo to find a safer venue",
          `Alexa, ask Planzo why ${excludedVenueName} won't work`,
          "Alexa, ask Planzo to show the recovery plan",
        ]
      : [
          `Alexa, ask Planzo what's happening with ${event.name}`,
          `Alexa, ask Planzo about the capacity of ${currentVenue?.name ?? "the venue"}`,
          "Alexa, ask Planzo to show the schedule",
        ];

  const suggestions = mode === "alexa" ? alexaSuggestions : standardSuggestions;

  // Stop any active speech on unmount
  useEffect(() => {
    return () => {
      if (hasSpeechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [hasSpeechSynthesis]);

  // Clear messages and cancel pending requests when event changes
  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    if (hasSpeechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
    setMessages([]);
    setLastOutcome(null);
    setIsSending(false);
  }, [event.id, state.resetKey, hasSpeechSynthesis]);

  // Cancel any in-flight request when component unmounts
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Auto-scroll when messages update
  useEffect(() => {
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const approvedDecision = getEventRecoveryDecision(state, event.id);
  const isRecovered =
    event.status !== "cancelled" && event.risk?.status === "handled" && !!approvedDecision;
  const asked = messages.some((m) => m.role === "assistant" && m.intent === "check_risk");
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");
  const showProposal = !!proposal && !!lastReply?.showProposal && lastOutcome !== "rejected";
  const step =
    lastOutcome || event.risk?.status === "handled"
      ? 3
      : showProposal
        ? 2
        : asked || messages.length
          ? 1
          : 0;

  function toggleSpeech(messageId: string, text: string) {
    if (!hasSpeechSynthesis) return;

    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  }

  async function ask(text: string) {
    const t = text.trim();
    if (!t || isSending) return;

    // Stop active speech before new query
    if (hasSpeechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);

    // Deterministic planning logic remains authoritative for intents & proposal triggers
    const intent = parseIntent(t);
    const fallback = replyFor(state, event.id, intent);

    setLastOutcome(null);
    setInput("");

    const userMsgId = `u-${Date.now()}`;
    const assistantMsgId = `a-${Date.now()}`;

    if (intent === "approve_guidance") {
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", text: t },
        {
          id: assistantMsgId,
          role: "assistant",
          text: fallback.text,
          intent,
          showProposal: fallback.showProposal,
          source: "computed",
        },
      ]);
      return;
    }

    // Immediately render user message & pending assistant bubble
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", text: t },
      {
        id: assistantMsgId,
        role: "assistant",
        text: "",
        intent,
        showProposal: fallback.showProposal,
        isStreaming: true,
        source: "gemini",
        errorNotice: null,
      },
    ]);

    // Abort previous in-flight request if any
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsSending(true);

    let receivedTokens = false;

    try {
      await sendChatMessage({
        state,
        event,
        userMessage: t,
        signal: controller.signal,
        onToken: (token) => {
          if (controller.signal.aborted) return;
          receivedTokens = true;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, text: m.text + token } : m)),
          );
        },
        onDone: () => {
          if (controller.signal.aborted) return;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, isStreaming: false } : m)),
          );
          setIsSending(false);
        },
        onError: () => {
          if (controller.signal.aborted) return;
          setIsSending(false);

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantMsgId) return m;

              if (!receivedTokens) {
                // Offline fallback: Use deterministic replyFor response
                return {
                  ...m,
                  text: fallback.text,
                  source: "fallback",
                  isStreaming: false,
                  errorNotice: "AI assistant unavailable — showing computed response.",
                };
              } else {
                // Streaming interrupted mid-flight: retain streamed text and append fallback guidance
                return {
                  ...m,
                  isStreaming: false,
                  source: "fallback",
                  errorNotice: "Stream interrupted. Showing computed response.",
                  text: m.text ? `${m.text}\n\n[Fallback]: ${fallback.text}` : fallback.text,
                };
              }
            }),
          );
        },
      });
    } catch {
      // Handled via onError callback
    } finally {
      if (abortControllerRef.current === controller) {
        setIsSending(false);
      }
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  function decide(kind: "approve" | "reject") {
    if (!proposal) return;
    try {
      if (kind === "approve") {
        approve(proposal.id);
        toast.success(`Moved to ${getVenue(state, proposal.toVenueId)?.name}`);
        setLastOutcome("approved");
      } else {
        reject(proposal.id);
        toast("Proposal rejected — event unchanged");
        setLastOutcome("rejected");
      }
    } catch (err) {
      toast.error(err instanceof PlanningError ? err.message : "Could not record the decision");
    }
  }

  return (
    <section
      aria-labelledby="studio-title"
      id="decision-studio"
      className="surface scroll-mt-20 overflow-hidden"
    >
      <div className="border-b px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 id="studio-title" className="text-lg font-extrabold tracking-tight">
              {mode === "alexa" ? "Alexa+ Experience Simulation" : "Decision Studio"}
            </h2>
            <Pill tone="primary">
              {mode === "alexa" ? "Voice Experience Simulation" : "Planzo Assistant"}
            </Pill>
          </div>

          {/* Mode Switcher Segmented Pills */}
          <div
            role="tablist"
            aria-label="Assistant mode selection"
            className="flex items-center rounded-lg border bg-muted/60 p-1 text-xs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === "standard"}
              onClick={() => setMode("standard")}
              className={cn(
                "rounded-md px-2.5 py-1 font-semibold transition-all",
                mode === "standard"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Standard
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "alexa"}
              onClick={() => setMode("alexa")}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold transition-all",
                mode === "alexa"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Radio className="size-3" aria-hidden="true" />
              Alexa+ Simulation
            </button>
          </div>
        </div>

        {/* Short Disclosure for Alexa+ Simulation Mode */}
        {mode === "alexa" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <p>
              <strong className="font-semibold text-foreground">Hackathon Simulation:</strong>{" "}
              Simulated Alexa+-style interaction powered by Gemini. Not connected to Amazon Alexa
              services.
            </p>
          </div>
        )}

        {/* Progress Stepper */}
        <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Progress">
          {["Sense", "Decide", "Act"].map((label, i) => {
            const done = step > i + 1 || (i === 2 && step === 3);
            const current = step === i + 1 || (step === 0 && i === 0);
            return (
              <li
                key={label}
                aria-current={current ? "step" : undefined}
                className="flex items-center gap-2"
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tabular",
                    done
                      ? "border-success bg-success text-success-foreground"
                      : current
                        ? "border-primary bg-primary-soft text-primary"
                        : "bg-background text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
                </span>
                <span
                  className={cn("text-sm font-bold", !done && !current && "text-muted-foreground")}
                >
                  {label}
                </span>
                {i < 2 && (
                  <span className="hidden h-px flex-1 bg-border sm:block" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="max-h-[420px] space-y-3 overflow-y-auto bg-background/60 px-5 py-5 md:px-6"
      >
        {messages.length === 0 && (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              Ask about <span className="font-semibold text-foreground">{event.name}</span>.
              {mode === "alexa"
                ? " Speak or type natural voice requests like 'Alexa, ask Planzo to find a safer venue'."
                : " Powered by Gemini with deterministic contingency planning."}
            </p>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div
              key={m.id}
              className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={m.id}
              className={cn(
                "max-w-[92%] rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm leading-relaxed",
                m.intent === "unsupported" && "border-dashed",
                m.source === "fallback" && "border-amber-500/40 bg-amber-500/5",
              )}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="eyebrow flex items-center gap-1.5">
                  {mode === "alexa" && (
                    <Sparkles className="size-3 text-primary" aria-hidden="true" />
                  )}
                  Planzo ·{" "}
                  {mode === "alexa"
                    ? m.source === "gemini"
                      ? "Alexa+ Voice Assistant (Simulated)"
                      : "Alexa+ Offline Reply"
                    : m.source === "gemini"
                      ? "Gemini Assistant"
                      : m.intent === "unsupported"
                        ? "Out of scope"
                        : "Computed reply"}
                </p>
                {m.source === "fallback" && (
                  <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    Offline fallback
                  </span>
                )}
              </div>

              {m.isStreaming && !m.text ? (
                <div className="flex items-center gap-1.5 py-1 text-muted-foreground">
                  <span className="size-2 animate-bounce rounded-full bg-primary" />
                  <span className="size-2 animate-bounce rounded-full bg-primary [animation-delay:0.2s]" />
                  <span className="size-2 animate-bounce rounded-full bg-primary [animation-delay:0.4s]" />
                  <span className="ml-1 text-xs">
                    {mode === "alexa"
                      ? "Simulating Alexa+ query response..."
                      : "Analyzing event contingency..."}
                  </span>
                </div>
              ) : (
                <div className="whitespace-pre-wrap">{m.text}</div>
              )}

              {m.isStreaming && m.text && (
                <span
                  className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-primary align-middle"
                  aria-hidden="true"
                />
              )}

              {m.errorNotice && (
                <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  {m.errorNotice}
                </p>
              )}

              {/* Optional Speech Synthesis Button */}
              {!m.isStreaming && m.text && hasSpeechSynthesis && (
                <div className="mt-2.5 flex items-center border-t pt-2">
                  <button
                    type="button"
                    onClick={() => toggleSpeech(m.id, m.text)}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label={
                      speakingMessageId === m.id
                        ? "Stop reading response aloud"
                        : "Read response aloud using browser speech synthesis"
                    }
                  >
                    {speakingMessageId === m.id ? (
                      <>
                        <VolumeX className="size-3.5 text-primary" aria-hidden="true" />
                        <span>Stop playback</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="size-3.5" aria-hidden="true" />
                        <span>Read response aloud</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <div className="border-t px-5 py-4 md:px-6">
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Suggested requests">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              disabled={isSending}
              className={cn(
                "h-auto min-h-9 rounded-full border bg-card px-3.5 py-1.5 text-left text-xs font-semibold transition-colors sm:text-sm",
                isSending
                  ? "cursor-not-allowed opacity-50"
                  : "hover:border-primary hover:text-primary",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="flex gap-2">
          <label htmlFor="studio-input" className="sr-only">
            {mode === "alexa" ? "Voice or text query for Alexa+" : "Ask Planzo about this event"}
          </label>
          <input
            id="studio-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isSending}
            placeholder={
              isSending
                ? "Waiting for response..."
                : mode === "alexa"
                  ? 'Type an Alexa+-style command: "Alexa, ask Planzo to find a safer venue"...'
                  : 'Ask about risk, schedule, or try "find an alternative"...'
            }
            className={cn(
              "h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3.5 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring",
              isSending && "cursor-not-allowed opacity-70",
            )}
          />
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11"
            aria-label="Send request"
            disabled={!input.trim() || isSending}
          >
            <Send aria-hidden="true" />
          </Button>
        </form>
      </div>

      {showProposal && proposal && <ProposalCard state={state} event={event} onDecide={decide} />}

      {!proposal &&
        event.risk?.status === "active" &&
        (lastReply?.intent === "find_alternative" || asked) && (
          <NoEligibleVenuesCard state={state} event={event} />
        )}

      {isRecovered && approvedDecision ? (
        <RecoveryCompleted state={state} event={event} decision={approvedDecision} />
      ) : lastOutcome === "rejected" ? (
        <Outcome tone="destructive" title="Rejected — nothing changed">
          {event.name} stays at {getVenue(state, event.venueId)?.name}. The risk remains open; ask
          again for an alternative any time.
        </Outcome>
      ) : null}
    </section>
  );
}

function NoEligibleVenuesCard({ state, event }: { state: DemoState; event: PlanEvent }) {
  const evaluations = evaluateVenues(state, event);

  return (
    <div className="border-t px-5 py-5 md:px-6" aria-labelledby="no-venue-title">
      <div className="flex items-center justify-between gap-2">
        <h3
          id="no-venue-title"
          className="text-base font-extrabold text-destructive flex items-center gap-1.5"
        >
          <AlertCircle className="size-4" />
          No eligible alternative venues
        </h3>
        <Pill tone="destructive">No proposal possible</Pill>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        Planzo evaluated all other campus venues for <strong>{event.name}</strong>, but none
        currently meet the required capacity ({event.attendees} attendees), equipment (
        {event.requiredEquipment.map((eq) => EQUIPMENT_LABEL[eq]).join(", ")}), and schedule
        availability.
      </p>

      <h4 className="eyebrow mt-4">Venue evaluation breakdown</h4>
      <ul className="mt-2 divide-y rounded-xl border">
        {evaluations.map((ev) => (
          <li
            key={ev.venue.id}
            className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between bg-destructive-soft/30"
          >
            <div className="flex items-center gap-2">
              <X className="size-4 text-destructive shrink-0" aria-hidden="true" />
              <span className="text-sm font-bold">{ev.venue.name}</span>
              <span className="text-xs text-muted-foreground tabular">
                {ev.venue.capacity} seats · {ev.venue.indoor ? "Indoor" : "Outdoor"}
              </span>
            </div>
            <span className="text-xs text-destructive font-medium sm:text-right">
              Excluded: {ev.reasons.join("; ")}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted-foreground">
        Recommendation: Reduce the expected attendee count or adjust required equipment in Edit
        Event.
      </p>
    </div>
  );
}

function Outcome({
  tone,
  title,
  children,
}: {
  tone: "success" | "destructive";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 border-t px-5 py-4 md:px-6",
        tone === "success" ? "bg-success-soft" : "bg-destructive-soft",
      )}
    >
      {tone === "success" ? (
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <CircleX className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
      )}
      <div>
        <p className="font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function ProposalCard({
  state,
  event,
  onDecide,
}: {
  state: DemoState;
  event: PlanEvent;
  onDecide: (k: "approve" | "reject") => void;
}) {
  const proposal = buildProposal(state, event.id)!;
  const from = getVenue(state, proposal.fromVenueId)!;
  const to = getVenue(state, proposal.toVenueId)!;
  const already = state.approvedProposalIds.includes(proposal.id);
  const rows: [string, string, string][] = [
    ["Venue", from.name, to.name],
    ["Setting", from.indoor ? "Indoor" : "Outdoor", to.indoor ? "Indoor" : "Outdoor"],
    ["Capacity", `${from.capacity} seats`, `${to.capacity} seats`],
    [
      "Time",
      `${fmtTime(event.start)}–${fmtTime(event.end)}`,
      `${fmtTime(event.start)}–${fmtTime(event.end)} (unchanged)`,
    ],
  ];
  return (
    <div className="border-t px-5 py-5 md:px-6" aria-labelledby="proposal-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="proposal-title" className="text-base font-extrabold">
          Proposed change
        </h3>
        <Pill tone="warning">Awaiting your decision</Pill>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <caption className="sr-only">Before and after comparison</caption>
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-bold">
                <span className="sr-only">Field</span>
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                Before
              </th>
              <th scope="col" className="px-3 py-2 font-bold">
                After
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, a, b]) => (
              <tr key={k} className="border-t">
                <th
                  scope="row"
                  className="px-3 py-2.5 text-left text-xs font-bold text-muted-foreground"
                >
                  {k}
                </th>
                <td className="px-3 py-2.5 text-muted-foreground">{a}</td>
                <td className="px-3 py-2.5 font-bold">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="eyebrow mt-5">Why {to.name}</h4>
      <ul className="mt-2 space-y-1.5 text-sm">
        {proposal.rationale.map((r) => (
          <li key={r} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            {r}
          </li>
        ))}
      </ul>

      <h4 className="eyebrow mt-5">Venue evidence</h4>
      <ul className="mt-2 divide-y rounded-xl border">
        {proposal.evaluations.map((ev) => (
          <li
            key={ev.venue.id}
            className={cn(
              "flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
              ev.eligible && "bg-success-soft",
            )}
          >
            <div className="flex items-center gap-2">
              {ev.eligible ? (
                <Check className="size-4 text-success" aria-hidden="true" />
              ) : (
                <X className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="text-sm font-bold">{ev.venue.name}</span>
              <span className="text-xs text-muted-foreground tabular">
                {ev.venue.capacity} seats
              </span>
            </div>
            <span
              className={cn(
                "text-xs sm:text-right",
                ev.eligible ? "font-bold text-success" : "text-muted-foreground",
              )}
            >
              {ev.eligible ? "Eligible · selected" : `Excluded: ${ev.reasons.join("; ")}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Required: {event.requiredEquipment.map((e) => EQUIPMENT_LABEL[e]).join(", ")} ·{" "}
        {event.attendees} attendees
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={() => onDecide("reject")}
          disabled={already}
          aria-label={`Reject moving ${event.name} to ${to.name}`}
        >
          <X aria-hidden="true" /> Reject
        </Button>
        <Button
          variant="approve"
          size="lg"
          onClick={() => onDecide("approve")}
          disabled={already}
          aria-label={`Approve moving ${event.name} to ${to.name}`}
        >
          <Check aria-hidden="true" /> Approve{" "}
          <ArrowRight className="hidden sm:block" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
