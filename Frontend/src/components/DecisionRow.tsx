import { Link } from "@tanstack/react-router";
import type { Decision, DemoState } from "@/data/types";
import { fmtDay, fmtTime, getEvent, getVenue } from "@/lib/planning";
import { Pill } from "./bits";

export function DecisionRow({ d, state }: { d: Decision; state: DemoState }) {
  const ev = getEvent(state, d.eventId);
  return (
    <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:gap-4">
      <time
        dateTime={d.at}
        className="w-28 shrink-0 text-xs font-semibold text-muted-foreground tabular"
      >
        {fmtDay(d.at)} · {fmtTime(d.at)}
      </time>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={d.outcome === "approved" ? "success" : "destructive"}>
            {d.outcome === "approved" ? "Approved" : "Rejected"}
          </Pill>
          {ev && (
            <Link
              to="/events/$id"
              params={{ id: ev.id }}
              className="font-bold hover:text-primary hover:underline"
            >
              {ev.name}
            </Link>
          )}
          {d.seeded && <span className="text-xs text-muted-foreground">Sample record</span>}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {getVenue(state, d.fromVenueId)?.name} → {getVenue(state, d.toVenueId)?.name}.{" "}
          {d.explanation}
        </p>
      </div>
    </li>
  );
}
