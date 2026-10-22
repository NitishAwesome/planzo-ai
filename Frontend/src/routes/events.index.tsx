import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useDemoState } from "@/services/demo-store";
import { fmtDay, fmtTime, getVenue } from "@/lib/planning";
import {
  DateBlock,
  eventStatus,
  PageHeader,
  StatusPill,
  STATUS_LABEL,
  type EventStatus,
} from "@/components/bits";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/events/")({
  head: () => ({
    meta: [
      { title: "Events — Planzo" },
      {
        name: "description",
        content: "All scheduled events with venue, attendees and disruption status.",
      },
      { property: "og:title", content: "Events — Planzo" },
      { property: "og:description", content: "Browse and filter events by status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Events,
});

function Events() {
  const s = useDemoState();
  const [filter, setFilter] = useState<"all" | EventStatus>("all");
  const list = s.events.filter((e) => filter === "all" || eventStatus(e) === filter);
  const opts: ("all" | EventStatus)[] = ["all", "at-risk", "handled", "on-track"];
  return (
    <>
      <PageHeader eyebrow="Events" title="All events" />
      <div role="group" aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        {opts.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={filter === o}
            onClick={() => setFilter(o)}
            className={cn(
              "h-9 rounded-full border px-4 text-sm font-semibold",
              filter === o
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card hover:border-primary",
            )}
          >
            {o === "all" ? "All" : STATUS_LABEL[o]} (
            {s.events.filter((e) => o === "all" || eventStatus(e) === o).length})
          </button>
        ))}
      </div>
      <ul className="surface divide-y">
        {list.length === 0 && (
          <li className="p-6 text-sm text-muted-foreground">No events with this status.</li>
        )}
        {list.map((e) => (
          <li key={e.id}>
            <Link
              to="/events/$id"
              params={{ id: e.id }}
              className="flex items-center gap-4 p-4 hover:bg-accent md:p-5"
            >
              <DateBlock start={e.start} />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{e.name}</p>
                <p className="text-sm text-muted-foreground">
                  {fmtDay(e.start)} · {fmtTime(e.start)}–{fmtTime(e.end)} ·{" "}
                  {getVenue(s, e.venueId)?.name} · {e.attendees} attendees
                </p>
              </div>
              <StatusPill event={e} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
