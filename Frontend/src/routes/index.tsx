import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CloudRain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemoState } from "@/services/demo-store";
import { fmtDay, fmtTime, getVenue, overviewMetrics } from "@/lib/planning";
import { DateBlock, PageHeader, SimLabel, StatusPill } from "@/components/bits";
import { DecisionRow } from "@/components/DecisionRow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations — Planzo" },
      {
        name: "description",
        content:
          "Planzo operations overview: upcoming events, at-risk events and contingency decisions.",
      },
      { property: "og:title", content: "Operations — Planzo" },
      {
        property: "og:description",
        content: "When plans change, move smarter. Event contingency assistant concept.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

const WORDS = ["No events need", "One event needs", "Two events need", "Three events need"];

function Overview() {
  const s = useDemoState();
  const { upcoming, atRisk, focus, suitable } = overviewMetrics(s);
  const fv = focus ? getVenue(s, focus.venueId) : null;
  const recent = [...s.decisions].reverse().slice(0, 3);
  return (
    <>
      <PageHeader
        eyebrow="Operations · Oct 22, 2026"
        title={`${WORDS[atRisk.length] ?? `${atRisk.length} events need`} a decision`}
      >
        {focus
          ? `${focus.name} is exposed to a simulated heavy-rain scenario. A suitable indoor alternative is available.`
          : "Every upcoming event is on track. Decisions you made are in the activity log."}
      </PageHeader>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          ["Upcoming events", upcoming.length, "Through Oct 27"],
          ["At-risk events", atRisk.length, atRisk.length ? "Decision pending" : "None open"],
          [
            "Suitable venues available",
            suitable,
            focus ? `For ${focus.name} slot` : "No active disruption",
          ],
        ].map(([k, v, sub]) => (
          <div key={k as string} className="surface p-5">
            <dt className="text-sm font-semibold text-muted-foreground">{k}</dt>
            <dd className="mt-2 text-4xl font-extrabold tracking-tight tabular">{v}</dd>
            <dd className="mt-1 text-xs text-muted-foreground">{sub}</dd>
          </div>
        ))}
      </dl>

      {focus && focus.risk && fv && (
        <section
          aria-labelledby="priority"
          className="surface mt-6 grid overflow-hidden md:grid-cols-[1fr_auto]"
        >
          <div className="border-l-4 border-warning p-6">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill event={focus} />
              <SimLabel />
            </div>
            <h2 id="priority" className="mt-3 text-2xl font-extrabold tracking-tight">
              {focus.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {fmtDay(focus.start)} · {fmtTime(focus.start)}–{fmtTime(focus.end)} · {fv.name} ·{" "}
              {focus.attendees} attendees
            </p>
            <p className="mt-4 flex gap-2 text-sm">
              <CloudRain className="size-5 shrink-0 text-warning-ink" aria-hidden="true" />
              <span>
                <strong>{focus.risk.title}</strong> ({focus.risk.probability}%, {focus.risk.window}
                ). {focus.risk.detail}
              </span>
            </p>
          </div>
          <div className="flex items-end border-t p-6 md:border-l md:border-t-0">
            <Button asChild size="lg">
              <Link to="/events/$id" params={{ id: focus.id }}>
                Review contingency <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="up" className="surface p-5">
          <h2 id="up" className="text-lg font-extrabold">
            Upcoming events
          </h2>
          <ul className="mt-3 divide-y">
            {upcoming.map((e) => (
              <li key={e.id}>
                <Link
                  to="/events/$id"
                  params={{ id: e.id }}
                  className="flex items-center gap-3 rounded-lg py-3 hover:bg-accent"
                >
                  <DateBlock start={e.start} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{e.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtTime(e.start)} · {getVenue(s, e.venueId)?.name} · {e.attendees} people
                    </p>
                  </div>
                  <StatusPill event={e} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="rd" className="surface p-5">
          <div className="flex items-center justify-between">
            <h2 id="rd" className="text-lg font-extrabold">
              Recent decisions
            </h2>
            <Link to="/activity" className="text-sm font-semibold text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul className="mt-1 divide-y">
            {recent.map((d) => (
              <DecisionRow key={d.id} d={d} state={s} />
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
