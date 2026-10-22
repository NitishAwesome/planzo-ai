import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, CircleCheck, CircleX, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { DemoState, PlanEvent } from "@/data/types";
import { EQUIPMENT_LABEL } from "@/data/types";
import {
  buildProposal,
  fmtTime,
  getVenue,
  parseIntent,
  PlanningError,
  replyFor,
  type AssistantReply,
} from "@/lib/planning";
import { approve, reject } from "@/services/demo-store";
import { cn } from "@/lib/utils";
import { Pill } from "./bits";

type Msg = { role: "user"; text: string } | { role: "assistant"; reply: AssistantReply };
const SUGGESTIONS = ["Check risk", "Find an alternative", "Show plan"];

export function DecisionStudio({ state, event }: { state: DemoState; event: PlanEvent }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [lastOutcome, setLastOutcome] = useState<null | "approved" | "rejected">(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setLastOutcome(null);
  }, [event.id]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const proposal = buildProposal(state, event.id);
  const asked = messages.some((m) => m.role === "assistant" && m.reply.intent === "check_risk");
  const lastReply = [...messages]
    .reverse()
    .find((m): m is Extract<Msg, { role: "assistant" }> => m.role === "assistant");
  const showProposal = !!proposal && !!lastReply?.reply.showProposal && lastOutcome !== "rejected";
  const step =
    lastOutcome || event.risk?.status === "handled"
      ? 3
      : showProposal
        ? 2
        : asked || messages.length
          ? 1
          : 0;

  function ask(text: string) {
    const t = text.trim();
    if (!t) return;
    setLastOutcome(null);
    setMessages((m) => [
      ...m,
      { role: "user", text: t },
      { role: "assistant", reply: replyFor(state, event.id, parseIntent(t)) },
    ]);
    setInput("");
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
          <h2 id="studio-title" className="text-lg font-extrabold tracking-tight">
            Decision Studio
          </h2>
          <Pill tone="primary">Alexa+ concept simulation</Pill>
        </div>
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
          <p className="text-sm text-muted-foreground">
            Ask about <span className="font-semibold text-foreground">{event.name}</span>. Replies
            are deterministic and computed from the venue and booking records — no live AI.
          </p>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div
              key={i}
              className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              {m.text}
            </div>
          ) : (
            <div
              key={i}
              className={cn(
                "max-w-[92%] rounded-2xl rounded-bl-md border bg-card px-4 py-3 text-sm leading-relaxed",
                m.reply.intent === "unsupported" && "border-dashed",
              )}
            >
              <p className="eyebrow mb-1">
                Planzo · {m.reply.intent === "unsupported" ? "Out of scope" : "Computed reply"}
              </p>
              {m.reply.text}
            </div>
          ),
        )}
      </div>

      <div className="border-t px-5 py-4 md:px-6">
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Suggested requests">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="h-9 rounded-full border bg-card px-3.5 text-sm font-semibold hover:border-primary hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="flex gap-2">
          <label htmlFor="studio-input" className="sr-only">
            Ask Planzo about this event
          </label>
          <input
            id="studio-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Try "find an alternative"'
            className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-card px-3.5 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
          />
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11"
            aria-label="Send request"
            disabled={!input.trim()}
          >
            <Send aria-hidden="true" />
          </Button>
        </form>
      </div>

      {showProposal && proposal && <ProposalCard state={state} event={event} onDecide={decide} />}

      {lastOutcome === "approved" && (
        <Outcome tone="success" title="Approved and applied">
          {event.name} is now reserved in {getVenue(state, event.venueId)?.name}. The previous venue
          slot was released and the decision was logged.
        </Outcome>
      )}
      {lastOutcome === "rejected" && (
        <Outcome tone="destructive" title="Rejected — nothing changed">
          {event.name} stays at {getVenue(state, event.venueId)?.name}. The risk remains open; ask
          again for an alternative any time.
        </Outcome>
      )}
    </section>
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
