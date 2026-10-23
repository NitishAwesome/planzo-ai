import { Link } from "@tanstack/react-router";
import type { Decision, DemoState } from "@/data/types";
import { fmtDay, fmtTime, getEvent, getVenue } from "@/lib/planning";
import { Pill } from "./bits";

const OUTCOME_CONFIG: Record<
  string,
  { tone: "success" | "destructive" | "primary" | "neutral"; label: string }
> = {
  approved: { tone: "success", label: "Approved" },
  rejected: { tone: "destructive", label: "Rejected" },
  created: { tone: "primary", label: "Created" },
  updated: { tone: "neutral", label: "Updated" },
  cancelled: { tone: "destructive", label: "Cancelled" },
  venue_created: { tone: "primary", label: "Venue Added" },
  venue_updated: { tone: "neutral", label: "Venue Updated" },
  venue_deleted: { tone: "destructive", label: "Venue Removed" },
  risk_updated: { tone: "primary", label: "Risk Updated" },
  risk_dismissed: { tone: "success", label: "Risk Dismissed" },
};

export function DecisionRow({ d, state }: { d: Decision; state: DemoState }) {
  if (!d) return null;
  const ev = d.eventId ? getEvent(state, d.eventId) : undefined;
  const cfg = OUTCOME_CONFIG[d.outcome] ?? { tone: "neutral", label: d.outcome || "Action" };
  const fromV = d.fromVenueId ? getVenue(state, d.fromVenueId) : undefined;
  const toV = d.toVenueId ? getVenue(state, d.toVenueId) : undefined;

  const venuePrefix =
    fromV && toV && fromV.id !== toV.id
      ? `${fromV.name} → ${toV.name}. `
      : toV
        ? `${toV.name} · `
        : fromV
          ? `${fromV.name} · `
          : "";

  const timeLabel = d.at ? `${fmtDay(d.at)} · ${fmtTime(d.at)}` : "Recent";

  return (
    <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:gap-4">
      <time
        dateTime={d.at || undefined}
        className="w-28 shrink-0 text-xs font-semibold text-muted-foreground tabular"
      >
        {timeLabel}
      </time>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={cfg.tone}>{cfg.label}</Pill>
          {ev ? (
            <Link
              to="/events/$id"
              params={{ id: ev.id }}
              className="font-bold hover:text-primary hover:underline"
            >
              {ev.name}
            </Link>
          ) : (
            <span className="font-bold">{d.eventName ?? "Event"}</span>
          )}
          {d.seeded && <span className="text-xs text-muted-foreground">Sample record</span>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {venuePrefix}
          {d.explanation || "No details provided."}
        </p>
      </div>
    </li>
  );
}
